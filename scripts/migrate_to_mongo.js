/**
 * One-time migration tool: import the cafe's existing local JSON data file
 * (e.g. data/state.json) into MongoDB Atlas, keyed by its siteId (cafeId).
 *
 * Usage:
 *   npm run migrate            (reads data/state.json)
 *   npm run migrate -- path/to/cafe.json
 *
 * Requires MONGO_URI to be set (in .env or the environment).
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Cafe = require('../src/models/Cafe');
const { mirrorCafeState } = require('../src/services/mirrorService');

const MONGO_URI = (process.env.MONGO_URI || '').trim();
if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not set. Run this from the server folder after adding it to .env.');
    process.exit(1);
}

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'state.json');
if (!fs.existsSync(file)) {
    console.error('❌ Source file not found:', file);
    console.error('   Usage: node migrate_to_mongo.js [path/to/cafe.json]');
    process.exit(1);
}

let raw;
try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
    console.error('❌ Could not parse', file, ':', e.message);
    process.exit(1);
}

// Supports both { state, version } wrappers and a bare state object.
const state = raw.state ?? raw;
const cafeId = (state && state.siteId ? String(state.siteId) : '').trim();
if (!cafeId) {
    console.error('❌ No siteId found in the source file — cannot determine the cafe id.');
    process.exit(1);
}
const version = raw && typeof raw.version === 'number' ? raw.version : 1;

async function run() {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const exists = await Cafe.findOne({ cafeId });
    if (exists) {
        exists.state = state;
        exists.version = version;
        await exists.save();
        console.log(`✔ Updated existing café ${cafeId} (version ${version}).`);
    } else {
        await Cafe.create({ cafeId, state, version });
        console.log(`✔ Imported café ${cafeId} (version ${version}).`);
    }
    await mirrorCafeState(state, cafeId);
    console.log('✔ Mirrored normalized collections (employees, menu, coupons, orders, audit).');
    await mongoose.disconnect();
    console.log('Migration complete.');
}

run().catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});