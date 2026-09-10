/**
 * Minimal, in-memory session store for Owner Portal logins.
 *
 * The server is a single process (one host computer or one Render instance),
 * so a plain Map is a legitimate session store and keeps this free of extra
 * dependencies (no cookie/session/JWT packages). Sessions:
 *   - live for 7 days,
 *   - are checked lazily (expired sessions are dropped on next use),
 *   - are lost on server restart (the owner just signs in again).
 *
 * The token is presented as `Authorization: Bearer <token>` or
 * `X-Owner-Token: <token>` by the Owner Portal page.
 */
const crypto = require('crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// token -> { ownerId, ownerUsername, createdAt }
const sessions = new Map();

function createSession(owner) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
        ownerId: owner._id.toString(),
        ownerUsername: owner.username,
        createdAt: Date.now()
    });
    return token;
}

function getSession(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        sessions.delete(token);
        return null;
    }
    return session;
}

function deleteSession(token) {
    if (token) sessions.delete(token);
}

module.exports = { createSession, getSession, deleteSession, SESSION_TTL_MS };