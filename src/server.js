const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
require('dotenv').config({ quiet: true });

const { connectDb } = require('./config/db');
const { attachWebSocket } = require('./realtime/websocket');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const cafeRoutes = require('./routes/cafeRoutes');
const authRoutes = require('./routes/authRoutes');
const couponRoutes = require('./routes/couponRoutes');
const ownerRoutes = require('./routes/ownerRoutes');

// --- Configuration ----------------------------------------------------------
const PORT = process.env.PORT || 3000;
const MONGO_URI = (process.env.MONGO_URI || '').trim();

const app = express();
app.use(express.json({ limit: '15mb' }));

// public/ lives one level up from src/.
app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
        // Always revalidate HTML so code updates reach every browser immediately.
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// Simple request logging (helpful for a first deployment).
app.use((req, res, next) => {
    if (req.method === 'POST') console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// --- Routes -------------------------------------------------------------------
app.use('/api', cafeRoutes);           // GET/POST /api/state (unchanged from before this restructure)
app.use('/api/auth', authRoutes);      // GET /api/auth/status
app.use('/api/coupons', couponRoutes); // GET /api/coupons, POST /api/coupons/reset-weekly (not implemented yet)
app.use('/api/owner', ownerRoutes);    // Owner Portal: owner login + multi-cafe staff management

app.use(notFound);
app.use(errorHandler);

// --- HTTP + WebSocket server -------------------------------------------------
const server = http.createServer(app);
attachWebSocket(server);

function localIPs() {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
    }
    return ips;
}

// Bind all interfaces so computers on the LAN can reach the server.
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('☕ Habesha Cafe server is running.');
    console.log(`   On this computer:      http://localhost:${PORT}`);
    localIPs().forEach(ip => console.log(`   On other computers:    http://${ip}:${PORT}`));
    console.log('');
    console.log('Keep this window open while the cafe is using the system.');
    console.log('Data now lives in MongoDB Atlas (cloud), one private store per cafe.');
    console.log('');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use. Close the other server window or set PORT=3001 before starting.\n`);
    } else {
        console.error('\n❌ Server error:', err.message, '\n');
    }
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

// --- Boot -------------------------------------------------------------------
connectDb(MONGO_URI).then(() => {
    console.log(`☕ Listening on port ${PORT}.`);
}).catch((err) => {
    console.error('❌ Could not connect to MongoDB:', err.message);
    process.exit(1);
});
