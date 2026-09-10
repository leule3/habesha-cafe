const express = require('express');
const router = express.Router();
const cafeController = require('../controllers/cafeController');
const { requireCafeAccess } = require('../middleware/auth');

// Mounted at /api in server.js, so these are GET/POST /api/state — the same
// paths the existing frontend (public/index.html) already calls. No
// frontend changes were needed for this restructure.
router.get('/state', requireCafeAccess, cafeController.getState);
router.post('/state', requireCafeAccess, cafeController.saveState);

module.exports = router;
