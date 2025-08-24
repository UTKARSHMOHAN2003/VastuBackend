const sql = require("mssql");
const { pool } = require("../config/db");
const crypto = require("crypto");

// Get all images
// Get all images
const getAllImages = async (req, res) => {
  try {
    const { category, project_id, title, access_token } = req.query;
    // Check admin access from header
    const isAdmin = req.headers["x-admin-access"] === "true";

    console.log("Admin access:", isAdmin); // Debug log

    let query =
      "SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE isActive = 1";
    const params = {};

    if (category) {
      query += " AND category = @category";
      params.category = category;
    }

    if (project_id) {
      query += " AND project_id = @project_id";
      params.project_id = parseInt(project_id);
    }

    if (title) {
      query += " AND title = @title";
      params.title = title;
    }

    query += " ORDER BY uploadDate DESC";

    let request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      request = request.input(key, value);
    }

    const result = await request.query(query);

    // Filter secret images based on access level
    const filteredImages = result.recordset.filter((image) => {
      if (image.category === "secret") {
        if (isAdmin) {
          console.log("Admin accessing secret image:", image.id);
          return true;
        }
        return access_token && access_token === image.access_token;
      }
      return true;
    });

    // Ensure access tokens are included for admin
    const responseImages = filteredImages.map((image) => {
      if (isAdmin) {
        return image; // Return full image data including access_token
      }
      const { access_token, ...imageWithoutToken } = image;
      return imageWithoutToken;
    });

    res.json(responseImages);
  } catch (err) {
    console.error("Error fetching images:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get image by ID
const getImageById = async (req, res) => {
  try {
    const { id } = req.params;
    const { access_token } = req.query;

    const result = await pool.request().input("id", sql.Int, id).query(`
        SELECT id, title, description, category, project_id, 
               content_type, uploadDate, access_token 
        FROM Images 
        WHERE id = @id AND isActive = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const image = result.recordset[0];

    // Only allow access with valid token
    if (
      image.category === "secret" &&
      (!access_token || access_token !== image.access_token)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(image);
  } catch (err) {
    console.error("Error fetching image:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Create new image(s) - FIXED VERSION
const createImage = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "Please upload at least one image" });
    }

    const { title, description, category, project_id } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const validCategory = ["built", "unbuilt", "secret"].includes(category)
      ? category
      : "unbuilt";

    if (project_id) {
      const projectImagesCount = await pool
        .request()
        .input("project_id", sql.Int, project_id)
        .query(
          "SELECT COUNT(*) as count FROM Images WHERE project_id = @project_id AND isActive = 1"
        );

      const currentCount = projectImagesCount.recordset[0].count;
      if (currentCount + req.files.length > 5) {
        return res.status(400).json({
          message: `Cannot add ${req.files.length} more images. Project already has ${currentCount} images. Maximum allowed is 5.`,
        });
      }
    }

    // FIXED: Only generate access token for secret projects, ensure it's properly generated
    const access_token =
      validCategory === "secret"
        ? crypto.randomBytes(32).toString("hex") // Increased token length for better security
        : null;

    const uploadedImages = [];

    for (const file of req.files) {
      const filename =
        file.originalname ||
        `image-${Date.now()}-${Math.round(Math.random() * 1000000000)}`;

      const filepath = `/uploads/${filename}`;

      console.log("Creating image with access_token:", access_token); // Debug log

      const insertResult = await pool
        .request()
        .input("title", sql.NVarChar(255), title)
        .input("description", sql.NVarChar(sql.MAX), description || "")
        .input("category", sql.NVarChar(100), validCategory)
        .input(
          "project_id",
          project_id ? sql.Int : sql.NVarChar,
          project_id || null
        )
        .input("image_data", sql.VarBinary(sql.MAX), file.buffer)
        .input("content_type", sql.NVarChar(100), file.mimetype)
        .input("filename", sql.NVarChar(255), filename)
        .input("filepath", sql.NVarChar(255), filepath)
        .input("access_token", sql.NVarChar(100), access_token).query(`
          INSERT INTO Images (title, description, category, project_id, image_data, content_type, filename, filepath, access_token)
          VALUES (@title, @description, @category, @project_id, @image_data, @content_type, @filename, @filepath, @access_token);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      const insertedId = insertResult.recordset[0].id;
      const result = await pool
        .request()
        .input("id", sql.Int, insertedId)
        .query(
          "SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE id = @id"
        );

      uploadedImages.push(result.recordset[0]);
    }

    res.status(201).json({
      message: `${uploadedImages.length} image(s) uploaded successfully`,
      images: uploadedImages,
    });
  } catch (err) {
    console.error("Error creating image:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update image
const updateImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, project_id } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const validCategory = ["built", "unbuilt", "secret"].includes(category)
      ? category
      : "unbuilt";

    const checkResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Images WHERE id = @id AND isActive = 1");

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (project_id && project_id !== checkResult.recordset[0].project_id) {
      const projectImagesCount = await pool
        .request()
        .input("project_id", sql.Int, project_id)
        .query(
          "SELECT COUNT(*) as count FROM Images WHERE project_id = @project_id AND isActive = 1"
        );

      if (projectImagesCount.recordset[0].count >= 5) {
        return res
          .status(400)
          .json({ message: "Project already has the maximum of 5 images" });
      }
    }

    // FIXED: Handle access token logic properly
    let access_token = checkResult.recordset[0].access_token;
    const currentCategory = checkResult.recordset[0].category;

    if (validCategory === "secret") {
      // If changing to secret or already secret, ensure we have a token
      if (!access_token) {
        access_token = crypto.randomBytes(32).toString("hex");
      }
    } else if (currentCategory === "secret" && validCategory !== "secret") {
      // If changing from secret to non-secret, clear the token
      access_token = null;
    }

    const updateResult = await pool
      .request()
      .input("id", sql.Int, id)
      .input("title", sql.NVarChar(255), title)
      .input("description", sql.NVarChar(sql.MAX), description || "")
      .input("category", sql.NVarChar(100), validCategory)
      .input(
        "project_id",
        project_id ? sql.Int : sql.NVarChar,
        project_id || null
      )
      .input("access_token", sql.NVarChar(100), access_token).query(`
        UPDATE Images
        SET title = @title, description = @description, category = @category, project_id = @project_id, access_token = @access_token
        WHERE id = @id;
      `);

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE id = @id"
      );

    res.json({
      message: "Image updated successfully",
      image: result.recordset[0],
    });
  } catch (err) {
    console.error("Error updating image:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get image data by ID - FIXED VERSION
const getImageData = async (req, res) => {
  try {
    const { id } = req.params;
    const { access_token } = req.query;

    // First get the image info including access requirements
    const checkAccess = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT category, access_token FROM Images WHERE id = @id AND isActive = 1"
      );

    if (checkAccess.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const imageInfo = checkAccess.recordset[0];

    // FIXED: Check access for secret projects properly
    if (imageInfo.category === "secret") {
      if (!imageInfo.access_token) {
        return res.status(403).json({
          message: "This secret project has no access token configured.",
        });
      }

      if (!access_token || access_token !== imageInfo.access_token) {
        return res.status(403).json({
          message:
            "Access denied. This is a secret project that requires a valid access token.",
        });
      }
    }

    // Get the actual image data
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT image_data, content_type FROM Images WHERE id = @id AND isActive = 1"
      );

    if (result.recordset.length === 0 || !result.recordset[0].image_data) {
      return res.status(404).json({ message: "Image data not found" });
    }

    res.set("Content-Type", result.recordset[0].content_type);
    res.send(result.recordset[0].image_data);
  } catch (err) {
    console.error("Error fetching image data:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Generate new access token for a secret project - FIXED VERSION
const regenerateAccessToken = async (req, res) => {
  try {
    const { id } = req.params;

    // Get project_id from the image
    const imageResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT project_id, category FROM Images WHERE id = @id AND isActive = 1"
      );

    if (imageResult.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const { project_id, category } = imageResult.recordset[0];

    if (category !== "secret") {
      return res
        .status(400)
        .json({ message: "Only secret projects can have access tokens" });
    }

    // Generate new token
    const access_token = crypto.randomBytes(32).toString("hex");

    // Update access token for all images in the project
    await pool
      .request()
      .input("project_id", sql.Int, project_id)
      .input("access_token", sql.NVarChar(100), access_token).query(`
        UPDATE Images 
        SET access_token = @access_token 
        WHERE project_id = @project_id 
        AND category = 'secret'
        AND isActive = 1
      `);

    res.json({
      message: "Access token regenerated successfully for all project images",
      access_token,
    });
  } catch (err) {
    console.error("Error regenerating access token:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete image
const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;

    const imageResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Images WHERE id = @id AND isActive = 1");

    if (imageResult.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .query("UPDATE Images SET isActive = 0 WHERE id = @id");

    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("Error deleting image:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update image file
const updateImageFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image file" });
    }

    const checkResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Images WHERE id = @id AND isActive = 1");

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = req.file.mimetype;

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("image_data", sql.VarBinary(sql.MAX), req.file.buffer)
      .input("content_type", sql.NVarChar(100), contentType).query(`
        UPDATE Images
        SET image_data = @image_data, content_type = @content_type
        WHERE id = @id;
      `);

    res.json({
      message: "Image file updated successfully",
      image_id: id,
    });
  } catch (err) {
    console.error("Error updating image file:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Revoke access to a secret project
const revokeAccess = async (req, res) => {
  try {
    const { id } = req.params;

    const checkResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT category FROM Images WHERE id = @id AND isActive = 1");

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    if (checkResult.recordset[0].category !== "secret") {
      return res
        .status(400)
        .json({ message: "Only secret projects can have access revoked" });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("access_token", sql.NVarChar(100), null)
      .query("UPDATE Images SET access_token = @access_token WHERE id = @id");

    res.json({
      message: "Access revoked successfully",
    });
  } catch (err) {
    console.error("Error revoking access:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get project by ID
const getProjectById = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { access_token } = req.query;

    const result = await pool
      .request()
      .input("projectId", sql.Int, projectId)
      .input("access_token", sql.NVarChar(100), access_token).query(`
        SELECT 
          id, title, description, category, project_id, 
          content_type, uploadDate, access_token
        FROM Images 
        WHERE project_id = @projectId 
        AND isActive = 1
        AND (category != 'secret' OR access_token = @access_token)
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get project info from the first image
    const projectInfo = {
      project_id: projectId,
      title: `Project ${projectId}`,
      images: result.recordset,
      totalImages: result.recordset.length,
    };

    res.json(projectInfo);
  } catch (error) {
    console.error("Error getting project:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all files in a project
const getProjectFiles = async (req, res) => {
  try {
    const { project_id, access_token } = req.query;

    if (!project_id || !access_token) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const result = await pool
      .request()
      .input("project_id", sql.Int, project_id)
      .input("access_token", sql.NVarChar(100), access_token).query(`
        SELECT id, title, description, category, project_id, 
               content_type, uploadDate, access_token
        FROM Images 
        WHERE project_id = @project_id 
        AND isActive = 1
        AND (category != 'secret' OR access_token = @access_token)
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching project files:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllImages,
  getImageById,
  createImage,
  updateImage,
  updateImageFile,
  deleteImage,
  getImageData,
  regenerateAccessToken,
  revokeAccess,
  getProjectById,
  getProjectFiles,
};
