const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple SHA-256 hash function to match frontend
function simpleHash(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// Load state.json
const statePath = path.join(__dirname, '..', 'data', 'state.json');
const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));

// Update admin password to 'admin123' using simple SHA-256 + salt
function updateAdminPassword() {
    const newPassword = 'admin123';
    
    // Generate a new salt (using UUID-like format)
    const salt = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    
    // Use simple SHA-256 with salt for compatibility
    const hash = simpleHash(newPassword, salt);
    
    // Find admin user
    const admin = stateData.state.employees.find(e => e.username === 'admin');
    if (admin) {
        admin.pw = { salt, hash };
        console.log('✅ Admin password updated to "admin123"');
        console.log('   Salt:', salt);
        console.log('   Hash:', hash);
    } else {
        console.log('❌ Admin user not found');
    }
    
    // Find superadmin user  
    const superadmin = stateData.state.employees.find(e => e.username === 'superadmin');
    if (superadmin) {
        superadmin.pw = { salt, hash };
        console.log('✅ Superadmin password updated to "admin123"');
    } else {
        console.log('❌ Superadmin user not found');
    }
    
    // Save updated state
    fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2));
    console.log('✅ State file saved');
}

updateAdminPassword();