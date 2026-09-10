/**
 * Owner Portal session guard.
 *
 * Unlike middleware/auth.js (the per-cafe access-key check used by the cafe
 * app's /api/state endpoints), this protects the /api/owner/* routes with an
 * Owner account session. It does NOT require a per-cafe access key — owners
 * manage every cafe, so key checks would just get in their way.
 */
const { getSession } = require('../services/ownerSessionService');

function tokenOf(req) {
    const header = req.headers['authorization'] || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim();
    return (req.headers['x-owner-token'] || '').toString().trim();
}

function requireOwner(req, res, next) {
    const session = getSession(tokenOf(req));
    if (!session) {
        return res.status(401).json({ error: 'Owner session missing or expired. Please sign in again.' });
    }
    req.ownerSession = session;
    next();
}

module.exports = { requireOwner, tokenOf };