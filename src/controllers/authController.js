/**
 * Auth logic for the cafe app.
 *
 * IMPORTANT — what this file actually does today:
 * There is no owner email/password signup or JWT login on the server yet.
 * Employee/admin login is still checked entirely client-side, in
 * public/index.html, against the employee list stored inside each cafe's
 * state blob. The one real server-side "auth" concept this app has is the
 * per-cafe access key: a random secret minted the first time a cafe is
 * created, which every request must present (via the X-Cafe-Key header) to
 * read or write that cafe's data. That's what lives here.
 *
 * Adding a real owner-account system (bcrypt-hashed passwords, a login
 * screen, JWTs) is a legitimate next step, but it needs a matching login UI
 * in the frontend — wiring a JWT endpoint the frontend never calls would
 * just be unused code, so it's left as a clearly-flagged follow-up rather
 * than faked here.
 */
const crypto = require('crypto');
const Cafe = require('../models/Cafe');

function generateAccessKey() {
    return crypto.randomBytes(24).toString('hex');
}

// Returns true if the request may proceed with this key. If the cafe
// predates access keys (no key on file yet), it "claims" one now instead of
// rejecting the request, so cafes created before this feature shipped keep
// working without a manual migration step.
async function verifyOrClaimKey(cafeDoc, providedKey) {
    if (!cafeDoc.accessKey) {
        cafeDoc.accessKey = generateAccessKey();
        await cafeDoc.save();
        return true;
    }
    return providedKey === cafeDoc.accessKey;
}

// GET /api/auth/status?cafe=xxx -> { cafe, claimed }
// Tells you whether a cafe id already has an access key on file, WITHOUT
// ever revealing the key itself. Handy for a setup/support flow ("is this a
// brand-new cafe, or an existing one that needs its key recovered?").
async function getKeyStatus(req, res) {
    try {
        const cafeId = (req.query.cafe || '').toString().trim();
        if (!cafeId) return res.status(400).json({ error: 'Missing ?cafe=' });
        const doc = await Cafe.findOne({ cafeId }).select('accessKey');
        res.json({ cafe: cafeId, claimed: !!(doc && doc.accessKey) });
    } catch (err) {
        console.error('GET /api/auth/status error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
}

module.exports = { generateAccessKey, verifyOrClaimKey, getKeyStatus };
