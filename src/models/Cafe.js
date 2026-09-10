/**
 * The per-cafe operational store (source of truth for the web app).
 * `cafeId` doubles as the tenant id and is unique per cafe.
 */
const mongoose = require('mongoose');

const CafeSchema = new mongoose.Schema(
    {
        cafeId: { type: String, required: true, unique: true, trim: true },
        // Friendly display name set by the Owner Portal (optional). Falls back
        // to the cafe's site id / cafeId in the UI.
        label: { type: String, default: null },
        // Shared-secret required (via the X-Cafe-Key header) to read or write
        // this cafe's data. Minted server-side the first time a cafe is
        // created (or "claimed" the first time an older cafe from before this
        // field existed is touched) — see controllers/authController.js.
        accessKey: { type: String, default: null },
        state: { type: mongoose.Schema.Types.Mixed, default: null },
        version: { type: Number, default: 0 } // optimistic-concurrency counter
    },
    { timestamps: true }
);
CafeSchema.index({ cafeId: 1 }, { unique: true });

module.exports = mongoose.model('Cafe', CafeSchema);
