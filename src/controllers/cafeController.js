/**
 * Logic for reading/saving a cafe's state (the app's main data — menu,
 * employees, orders, coupons, etc. all live in one JSON blob per cafe).
 *
 * Access control (cafeId + access key) already happened in
 * middleware/auth.js by the time these run — req.cafeDoc is the cafe's
 * document (or null if it doesn't exist yet) and req.cafeId is its id.
 */
const Cafe = require('../models/Cafe');
const { generateAccessKey } = require('./authController');
const { mirrorCafeState } = require('../services/mirrorService');
const { broadcast } = require('../realtime/websocket');

// GET /api/state?cafe=xxx -> that cafe's state + version.
async function getState(req, res) {
    try {
        const doc = req.cafeDoc;
        if (!doc) return res.json({ state: null, version: 0, cafe: null });
        res.json({ state: doc.state, version: doc.version, cafe: doc.cafeId, key: doc.accessKey });
    } catch (err) {
        console.error('GET /api/state error:', err.message);
        res.status(500).json({ error: 'Server error while reading cafe data.' });
    }
}

// POST /api/state -> save this cafe's state (with optimistic concurrency).
async function saveState(req, res) {
    try {
        const { state, baseVersion } = req.body || {};
        if (!state) return res.status(400).json({ error: 'Missing state in request body.' });

        const cafeId = req.cafeId;
        if (!cafeId) {
            return res.status(400).json({ error: 'Missing cafe identifier — reload the page so a tenant id is assigned.' });
        }

        let doc = req.cafeDoc;
        if (doc && typeof baseVersion === 'number' && baseVersion !== doc.version) {
            return res.status(409).json({
                error: 'Version conflict — someone else saved first.',
                state: doc.state,
                version: doc.version,
                cafe: doc.cafeId
            });
        }

        if (!doc) {
            // First save for a brand-new cafe: seed without needing a version,
            // and mint the access key this cafe will use from now on.
            doc = new Cafe({ cafeId, state, version: 1, accessKey: generateAccessKey() });
        } else {
            doc.state = state;
            doc.version = (doc.version || 0) + 1;
        }
        await doc.save();

        // Mirror the blob into the normalized multi-cafe collections.
        // Best-effort; never blocks the save from succeeding.
        mirrorCafeState(state, cafeId);

        broadcast(cafeId, { type: 'state', state, version: doc.version });
        res.json({ ok: true, version: doc.version, state, cafe: cafeId, key: doc.accessKey });
    } catch (err) {
        console.error('POST /api/state error:', err.message);
        res.status(500).json({ error: 'Saving failed — please try again.' });
    }
}

module.exports = { getState, saveState };
