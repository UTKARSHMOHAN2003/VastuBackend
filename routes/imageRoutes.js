const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const upload = require('../middleware/uploadMiddleware');

// GET all images
router.get('/', imageController.getAllImages);

// GET single image by ID
router.get('/:id', imageController.getImageById);

// GET image data by ID
router.get('/:id/data', imageController.getImageData);

// POST new image(s) - supports multiple uploads
router.post('/', upload.array('images', 10), imageController.createImage);

// PUT update image
router.put('/:id', imageController.updateImage);

// DELETE image
router.delete('/:id', imageController.deleteImage);

// POST regenerate access token for a secret project
router.post('/:id/regenerate-token', imageController.regenerateAccessToken);

// POST revoke access to a secret project
router.post('/:id/revoke-access', imageController.revokeAccess);

module.exports = router;