/**
 * Owner account — the person who runs the whole multi-cafe system.
 *
 * This is the first real "account" login on the server (the per-cafe app's
 * employee/admin login is still entirely client-side against each cafe's
 * state blob). Owners sign in on /owner.html (the Owner Portal) and manage
 * Cafe Admin / HR credentials inside every cafe.
 *
 * Passwords are hashed with Node's built-in crypto.scrypt (salted, 64-byte
 * key). No extra dependency is needed. The Owner password hash is NOT the
 * same scheme the web app uses for staff passwords (that scheme must match
 * the frontend's pure-JS SHA-256, because staff login runs in the browser).
 */
const mongoose = require('mongoose');

const OwnerSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true, lowercase: true },
        name: { type: String, default: '', trim: true },
        salt: { type: String, required: true },
        hash: { type: String, required: true }
    },
    { timestamps: true }
);
OwnerSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('Owner', OwnerSchema);