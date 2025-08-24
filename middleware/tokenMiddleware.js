const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const verifyAccessToken = async (req, res, next) => {
  try {
    const { access_token } = req.query;
    
    if (!access_token) {
      return res.status(403).json({ message: 'Access token required' });
    }

    // Check if token exists and is not expired in database
    const result = await pool.request()
      .input('access_token', sql.NVarChar(100), access_token)
      .query(`
        SELECT id, expiry_date 
        FROM Images 
        WHERE access_token = @access_token 
        AND isActive = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(403).json({ message: 'Invalid access token' });
    }

    const image = result.recordset[0];
    
    // Check if token is expired
    if (image.expiry_date && new Date(image.expiry_date) < new Date()) {
      return res.status(403).json({ message: 'Access token has expired' });
    }

    // Attach image ID to request
    req.imageId = image.id;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ message: 'Error verifying access token' });
  }
};

module.exports = { verifyAccessToken };