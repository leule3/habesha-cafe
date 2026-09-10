/**
 * Normalized employee documents, mirrored from Cafe.state.employees by
 * services/mirrorService.js. Scoped per cafe via `cafeId`.
 */
const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, index: true },
        employeeId: { type: String, required: true },
        username: { type: String },
        name: { type: String },
        role: { type: String },
        status: { type: String },
        data: { type: mongoose.Schema.Types.Mixed }
    },
    { timestamps: true }
);
EmployeeSchema.index({ cafeId: 1, employeeId: 1 }, { unique: true });

module.exports = mongoose.model('Employee', EmployeeSchema);
