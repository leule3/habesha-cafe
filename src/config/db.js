/**
 * Database connection (MongoDB Atlas setup).
 */
const mongoose = require('mongoose');
const dns = require('dns');

// Public resolvers used as a fallback when the machine's default DNS resolver
// is misconfigured (Node's c-ares returns ECONNREFUSED for every hostname,
// even when the OS `nslookup` works fine — seen on some VPN/router setups).
const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];

/**
 * Ensure mongodb+srv:// hostnames can be resolved by Node's DNS resolver.
 * The mongodb driver resolves SRV records using Node's async (c-ares)
 * resolver. On machines where that resolver is broken, we fall back to
 * well-known public resolvers. On healthy machines this is a no-op.
 */
async function ensureDnsResolver(mongoUri) {
    if (!mongoUri || !mongoUri.startsWith('mongodb+srv')) return;

    // Extract the hostname: strip scheme+creds, then anything after the next '/'.
    let host;
    try {
        const afterAuth = mongoUri.split('@').pop();
        host = afterAuth.split('/')[0];
    } catch {
        return;
    }
    if (!host) return;

    // Guard the probe with a timeout: a misconfigured resolver may HANG rather
    // than reject. Without this, the boot could stall.
    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('dns timeout')), 5000));
    try {
        const probe = dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
        probe.catch(() => { /* swallow a late rejection */ });
        await Promise.race([probe, timer]);
        // Default resolver works — nothing to change.
        return;
    } catch {
        // Fall back to public resolvers; if the machine can't reach those
        // either, the real connect() below will surface a clear Mongo error.
        try {
            dns.setServers(PUBLIC_DNS);
            console.log('Using public DNS resolvers because the system default failed.');
        } catch {
            /* ignore */
        }
    }
}

async function connectDb(mongoUri) {
    if (!mongoUri) {
        console.error('\n❌ MONGO_URI is not set.\n');
        console.error('   Add it to a .env file, e.g.:');
        console.error('     MONGO_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/habesha-cafe');
        console.error('   or set it as an environment variable in your host\'s dashboard');
        console.error('   (Render / Heroku / Railway -> Environment). Then run npm start again.\n');
        process.exit(1);
    }
    await ensureDnsResolver(mongoUri);
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        autoIndex: true
    });
    console.log('Connected to MongoDB Atlas.');
}

module.exports = { connectDb };
