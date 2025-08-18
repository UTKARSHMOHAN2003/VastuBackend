const sql = require('mssql');
const { pool } = require('../config/db'); // Import the pool directly
const crypto = require('crypto'); // Add this for generating access tokens

// Get all images
const getAllImages = async (req, res) => {
  try {
    // Filter by category if provided
    const { category, project_id, title } = req.query;
    
    let query = 'SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE isActive = 1';
    const params = {};
    
    if (category) {
      query += ' AND category = @category';
      params.category = category;
    }
    
    if (project_id) {
      query += ' AND project_id = @project_id';
      params.project_id = parseInt(project_id);
    }
    
    if (title) {
      query += ' AND title = @title';
      params.title = title;
    }
    
    query += ' ORDER BY uploadDate DESC';
    
    // Build the request with parameters
    let request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      request = request.input(key, value);
    }
    
    const result = await request.query(query);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get image by ID
const getImageById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeData, access_token } = req.query;
    
    // Select specific columns or all columns based on includeData parameter
    const columns = includeData === 'true' 
      ? '*' 
      : 'id, title, description, category, project_id, content_type, uploadDate, access_token';
    
    // Use the existing pool
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT ${columns} FROM Images WHERE id = @id AND isActive = 1`);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    const image = result.recordset[0];
    
    // Check access for secret projects
    if (image.category === 'secret' && access_token !== image.access_token) {
      return res.status(403).json({ message: 'Access denied. This is a secret project that requires a valid access token.' });
    }
    
    // If image data is requested, send it as a base64 string
    if (includeData === 'true' && image.image_data) {
      res.set('Content-Type', image.content_type);
      res.send(image.image_data);
    } else {
      // Don't send access_token in response unless it's an admin request
      if (!req.headers['x-admin-access']) {
        delete image.access_token;
      }
      res.json(image);
    }
  } catch (err) {
    console.error('Error fetching image:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Create new image(s) - supports multiple uploads
const createImage = async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please upload at least one image' });
    }
    
    const { title, description, category, project_id } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    
    // Validate category
    const validCategory = ['built', 'unbuilt', 'secret'].includes(category) ? category : 'unbuilt';
    
    // Check if project already has 5 images
    if (project_id) {
      const projectImagesCount = await pool.request()
        .input('project_id', sql.Int, project_id)
        .query('SELECT COUNT(*) as count FROM Images WHERE project_id = @project_id AND isActive = 1');
      
      const currentCount = projectImagesCount.recordset[0].count;
      if (currentCount + req.files.length > 5) {
        return res.status(400).json({ 
          message: `Cannot add ${req.files.length} more images. Project already has ${currentCount} images. Maximum allowed is 5.` 
        });
      }
    }
    
    // Generate access token for secret projects
    const access_token = validCategory === 'secret' 
      ? crypto.randomBytes(16).toString('hex')
      : null;
    
    // Use the existing pool
    const uploadedImages = [];
    
    // Process each uploaded file
    for (const file of req.files) {
      // Generate a filename if one doesn't exist
      const filename = file.originalname || `image-${Date.now()}-${Math.round(Math.random() * 1000000000)}`;
      
      console.log('File object:', file); // Add this for debugging
      console.log('Using filename:', filename); // Add this for debugging
      
      // Add a filepath value (even if it's just a placeholder)
      const filepath = `/uploads/${filename}`;
      
      // Log all parameters being sent to SQL
      console.log('SQL parameters:', {
        title,
        description,
        category: validCategory,
        project_id,
        content_type: file.mimetype,
        filename,
        filepath,
        access_token
      });
      
      // Insert into database with binary data
      const insertResult = await pool.request()
        .input('title', sql.NVarChar(255), title)
        .input('description', sql.NVarChar(sql.MAX), description || '')
        .input('category', sql.NVarChar(100), validCategory)
        .input('project_id', project_id ? sql.Int : sql.NVarChar, project_id || null)
        .input('image_data', sql.VarBinary(sql.MAX), file.buffer)
        .input('content_type', sql.NVarChar(100), file.mimetype)
        .input('filename', sql.NVarChar(255), filename)
        .input('filepath', sql.NVarChar(255), filepath)
        .input('access_token', sql.NVarChar(100), access_token)
        .query(`
          INSERT INTO Images (title, description, category, project_id, image_data, content_type, filename, filepath, access_token)
          VALUES (@title, @description, @category, @project_id, @image_data, @content_type, @filename, @filepath, @access_token);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      // Get the inserted record details
      const insertedId = insertResult.recordset[0].id;
      const result = await pool.request()
        .input('id', sql.Int, insertedId)
        .query('SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE id = @id');
      
      uploadedImages.push(result.recordset[0]);
    }
    
    res.status(201).json({
      message: `${uploadedImages.length} image(s) uploaded successfully`,
      images: uploadedImages
    });
  } catch (err) {
    console.error('Error creating image:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update image file
const updateImageFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }
    
    // Check if image exists
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Images WHERE id = @id AND isActive = 1');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Convert file buffer to base64
    const imageData = req.file.buffer.toString('base64');
    const contentType = req.file.mimetype;
    
    // Update image file data
    await pool.request()
      .input('id', sql.Int, id)
      .input('image_data', sql.VarBinary(sql.MAX), Buffer.from(imageData, 'base64'))
      .input('content_type', sql.NVarChar(100), contentType)
      .query(`
        UPDATE Images
        SET image_data = @image_data, content_type = @content_type
        WHERE id = @id;
      `);
    
    res.json({
      message: 'Image file updated successfully',
      image_id: id
    });
  } catch (err) {
    console.error('Error updating image file:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update image
const updateImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, project_id } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    
    // Validate category
    const validCategory = ['built', 'unbuilt', 'secret'].includes(category) ? category : 'unbuilt';
    
    // Check if image exists
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Images WHERE id = @id AND isActive = 1');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // If project_id is changing, check if the new project already has 5 images
    if (project_id && project_id !== checkResult.recordset[0].project_id) {
      const projectImagesCount = await pool.request()
        .input('project_id', sql.Int, project_id)
        .query('SELECT COUNT(*) as count FROM Images WHERE project_id = @project_id AND isActive = 1');
      
      if (projectImagesCount.recordset[0].count >= 5) {
        return res.status(400).json({ message: 'Project already has the maximum of 5 images' });
      }
    }
    
    // Check if we need to generate a new access token
    let access_token = checkResult.recordset[0].access_token;
    if (validCategory === 'secret' && !access_token) {
      // Generate new access token if changing to secret and doesn't have one
      access_token = crypto.randomBytes(16).toString('hex');
    } else if (validCategory !== 'secret') {
      // Clear access token if not a secret project
      access_token = null;
    }
    
    // Update image metadata
    const updateResult = await pool.request()
      .input('id', sql.Int, id)
      .input('title', sql.NVarChar(255), title)
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .input('category', sql.NVarChar(100), validCategory)
      .input('project_id', project_id ? sql.Int : sql.NVarChar, project_id || null)
      .input('access_token', sql.NVarChar(100), access_token)
      .query(`
        UPDATE Images
        SET title = @title, description = @description, category = @category, project_id = @project_id, access_token = @access_token
        WHERE id = @id;
      `);
    
    // Get the updated record details
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id, title, description, category, project_id, content_type, uploadDate, access_token FROM Images WHERE id = @id');
    
    res.json({
      message: 'Image updated successfully',
      image: result.recordset[0]
    });
  } catch (err) {
    console.error('Error updating image:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete image
const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image info before deletion
    const imageResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Images WHERE id = @id AND isActive = 1');
    
    if (imageResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Soft delete in database (set isActive to 0)
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Images SET isActive = 0 WHERE id = @id');
    
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get image data by ID
const getImageData = async (req, res) => {
  try {
    const { id } = req.params;
    const { access_token } = req.query;
    
    // First check if this is a secret project and verify access token
    const checkAccess = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT category, access_token FROM Images WHERE id = @id AND isActive = 1');
    
    if (checkAccess.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Check access for secret projects
    if (checkAccess.recordset[0].category === 'secret' && 
        access_token !== checkAccess.recordset[0].access_token) {
      return res.status(403).json({ message: 'Access denied. This is a secret project that requires a valid access token.' });
    }
    
    // Use the existing pool
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT image_data, content_type FROM Images WHERE id = @id AND isActive = 1');
    
    if (result.recordset.length === 0 || !result.recordset[0].image_data) {
      return res.status(404).json({ message: 'Image data not found' });
    }
    
    // Set the content type and send the binary data
    res.set('Content-Type', result.recordset[0].content_type);
    res.send(result.recordset[0].image_data);
  } catch (err) {
    console.error('Error fetching image data:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Generate new access token for a secret project
const regenerateAccessToken = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if image exists and is a secret project
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT category FROM Images WHERE id = @id AND isActive = 1');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    if (checkResult.recordset[0].category !== 'secret') {
      return res.status(400).json({ message: 'Only secret projects can have access tokens' });
    }
    
    // Generate new access token
    const access_token = crypto.randomBytes(16).toString('hex');
    
    // Update the access token
    await pool.request()
      .input('id', sql.Int, id)
      .input('access_token', sql.NVarChar(100), access_token)
      .query('UPDATE Images SET access_token = @access_token WHERE id = @id');
    
    res.json({
      message: 'Access token regenerated successfully',
      access_token
    });
  } catch (err) {
    console.error('Error regenerating access token:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Revoke access to a secret project
const revokeAccess = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if image exists and is a secret project
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT category FROM Images WHERE id = @id AND isActive = 1');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    if (checkResult.recordset[0].category !== 'secret') {
      return res.status(400).json({ message: 'Only secret projects can have access revoked' });
    }
    
    // Set access token to null to revoke access
    await pool.request()
      .input('id', sql.Int, id)
      .input('access_token', sql.NVarChar(100), null)
      .query('UPDATE Images SET access_token = @access_token WHERE id = @id');
    
    res.json({
      message: 'Access revoked successfully'
    });
  } catch (err) {
    console.error('Error revoking access:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
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
  revokeAccess
};