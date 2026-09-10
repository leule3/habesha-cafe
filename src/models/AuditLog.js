/**
 * Activity log, mirrored from Cafe.state.audit.
 * Added alongside Cafe/Employee/Coupon for the same reason as MenuItem.js.
 */
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, index: true },
        id: { type: String },
        at: { type: Date },
        actor: { type: String },
        action: { type: String }
    },
    { timestamps: true }
);
AuditLogSchema.index({ cafeId: 1, at: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
