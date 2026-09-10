const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Mounted at /api/auth in server.js.
// GET /api/auth/status?cafe=xxx -> { cafe, claimed }
router.get('/status', authController.getKeyStatus);

module.exports = router;
