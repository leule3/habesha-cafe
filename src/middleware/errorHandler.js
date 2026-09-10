/**
 * Centralized error handling.
 *
 * Most routes still catch and respond to their own errors directly (to keep
 * their existing, specific error messages). This is the safety net for
 * anything that throws without being caught, plus a JSON 404 for unknown
 * routes/API paths.
 */
function notFound(req, res) {
    res.status(404).json({ error: 'Not found.' });
}

function errorHandler(err, req, res, next) {
    console.error('Unhandled error:', err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.publicMessage || 'Server error — please try again.' });
}

module.exports = { notFound, errorHandler };
