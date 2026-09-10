/**
 * Live updates (WebSocket), scoped per cafe.
 *
 * Not in your original file list — added because the app's live-sync
 * feature (Order Queue/Dashboard updating instantly on every screen) needs
 * somewhere to live, and controllers/cafeController.js needs a `broadcast`
 * function to call after every save.
 */
const WebSocket = require('ws');
const Cafe = require('../models/Cafe');
const { verifyOrClaimKey } = require('../controllers/authController');

let wss = null;
const socketCafes = new Map(); // ws -> cafeId that this client belongs to

function attachWebSocket(server) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const cafeId = params.get('cafe') || '';
        const key = (params.get('key') || '').trim();
        socketCafes.set(ws, cafeId);

        // Send the current state for THIS cafe's WebSocket only — but not
        // before checking the access key, so live updates can't be snooped
        // by anyone who only knows (or guesses) the cafeId.
        (async () => {
            try {
                let doc = cafeId ? await Cafe.findOne({ cafeId }) : null;
                if (!cafeId) {
                    const count = await Cafe.countDocuments();
                    if (count === 1) doc = await Cafe.findOne();
                }
                if (doc) {
                    const ok = await verifyOrClaimKey(doc, key);
                    if (!ok) {
                        socketCafes.delete(ws);
                        ws.close(4401, 'Invalid cafe key');
                        return;
                    }
                }
                if (doc && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'state', state: doc.state, version: doc.version }));
                }
            } catch (err) {
                /* ignore individual socket errors */
            }
        })();

        ws.on('close', () => socketCafes.delete(ws));
    });

    return wss;
}

function broadcast(cafeId, payload) {
    if (!wss) return;
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (cafeId && socketCafes.get(client) === cafeId) client.send(msg);
    });
}

module.exports = { attachWebSocket, broadcast };
