/**
 * Multi-tenant + access-key checks.
 *
 * (Note: this is NOT JWT-based — see controllers/authController.js for why.
 * It's the real current auth mechanism: every request is scoped to a cafeId,
 * and — once a cafe has a key on file — must present the matching
 * X-Cafe-Key header or ?key= param.)
 */
const Cafe = require('../models/Cafe');
const { verifyOrClaimKey } = require('../controllers/authController');

function resolveCafeId(req) {
    const fromQueryOrHeader = (req.query.cafe || req.headers['x-cafe-id'] || '').toString().trim();
    if (fromQueryOrHeader) return fromQueryOrHeader;
    const fromBody = req.body && req.body.state && req.body.state.siteId;
    return (fromBody || '').toString().trim();
}

function keyOf(req) {
    return (req.query.key || req.headers['x-cafe-key'] || (req.body && req.body.key) || '').toString().trim();
}

// Loads the cafe (if it already exists) and checks the caller's key against
// it. A cafe that doesn't exist yet is let through with req.cafeDoc = null,
// so a controller can create it (and mint its first key) on first save.
async function requireCafeAccess(req, res, next) {
    try {
        const cafeId = resolveCafeId(req);
        req.cafeId = cafeId;
        req.cafeKey = keyOf(req);

        let doc = null;
        if (cafeId) {
            doc = await Cafe.findOne({ cafeId });
        } else if (req.method === 'GET') {
            // Recovery path: no cafe id supplied — only resolve it when
            // exactly one cafe exists in the whole database. We never guess
            // which one you meant when there's more than one.
            const count = await Cafe.countDocuments();
            if (count === 1) doc = await Cafe.findOne();
        }

        if (doc) {
            const ok = await verifyOrClaimKey(doc, req.cafeKey);
            if (!ok) {
                return res.status(401).json({ error: 'Missing or invalid cafe key for this device.' });
            }
        }

        req.cafeDoc = doc; // null = "no cafe yet"; the controller decides what that means
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireCafeAccess, resolveCafeId, keyOf };
