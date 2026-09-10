// Reset every non-admin employee's password to the default '123'
// using the same simple SHA-256(password + salt) scheme the frontend now uses.
// Admin & Super Admin passwords are NOT touched (they stay 'admin123').
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const statePath = path.join(__dirname, '..', 'data', 'state.json');
const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));

function simpleHash(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

let reset = 0;
let skipped = 0;
for (const e of stateData.state.employees) {
    if (e.role !== 'employee') { skipped++; continue; }
    const salt = crypto.randomUUID();
    e.pw = { salt, hash: simpleHash('123', salt) };
    reset++;
}

stateData.state.lastModified = new Date().toISOString();
fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2));

console.log(`Reset ${reset} employee password(s) to '123' (skipped ${skipped} admin/superadmin).`);
console.log('Restart the server for the change to take effect.');