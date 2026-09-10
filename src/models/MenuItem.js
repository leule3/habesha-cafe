/**
 * Menu items, mirrored from Cafe.state.menu and Cafe.state.walkinMenu.
 * Added alongside Cafe/Employee/Coupon — the mirror step needs it to keep
 * working; it wasn't in the original file list but nothing else covers it.
 */
const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, index: true },
        itemId: { type: String, required: true },
        name: { type: String },
        price: { type: Number },
        available: { type: Boolean },
        sort: { type: Number },
        scope: { type: String, default: 'menu' } // 'menu' | 'walkin'
    },
    { timestamps: true }
);
MenuItemSchema.index({ cafeId: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model('MenuItem', MenuItemSchema);
