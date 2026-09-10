const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { requireCafeAccess } = require('../middleware/auth');

// Mounted at /api/coupons in server.js.
router.get('/', requireCafeAccess, couponController.listCoupons);
router.post('/reset-weekly', requireCafeAccess, couponController.resetWeeklyCoupons); // 501 — not implemented yet

module.exports = router;
