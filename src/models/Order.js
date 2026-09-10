/**
 * Order history, mirrored from Cafe.state.orders.
 * Added alongside Cafe/Employee/Coupon for the same reason as MenuItem.js.
 */
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, index: true },
        orderId: { type: String, required: true },
        groupId: { type: String },
        at: { type: Date },
        customer: { type: String },
        employeeId: { type: String },
        itemId: { type: String },
        itemName: { type: String },
        total: { type: Number },
        payment: { type: String },
        served: { type: Boolean }
    },
    { timestamps: true }
);
OrderSchema.index({ cafeId: 1, orderId: 1 }, { unique: true });

module.exports = mongoose.model('Order', OrderSchema);
