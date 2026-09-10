/**
 * Coupon balances, one document per employee per cafe. Mirrored from
 * Cafe.state.employees by services/mirrorService.js.
 */
const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, index: true },
        employeeId: { type: String, required: true },
        coupons: { type: Number, default: 0 },        // standard coupons
        nightCoupons: { type: Number, default: 0 },
        regularCents: { type: Number, default: 0 },
        nightCents: { type: Number, default: 0 }
    },
    { timestamps: true }
);
CouponSchema.index({ cafeId: 1, employeeId: 1 }, { unique: true });

module.exports = mongoose.model('Coupon', CouponSchema);
