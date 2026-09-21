// Extract inline <script> blocks from public/index.html and syntax-check each.
const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const matches = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
console.log('Found', matches.length, 'script block(s).');
let allOk = true;
matches.forEach((m, i) => {
    const attrs = m[1];
    if (/\ssrc=/.test(attrs)) {
        console.log(`Block ${i}: external (${attrs.trim()}) - skipped`);
        return;
    }
    const tmp = path.join(__dirname, `tmp_script_${i}.js`);
    fs.writeFileSync(tmp, m[2]);
    const { execSync } = require('child_process');
    try {
        execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
        console.log(`Block ${i}: syntax OK (${m[2].length} chars)`);
    } catch (err) {
        allOk = false;
        console.log(`Block ${i}: SYNTAX ERROR!\n${err.stderr.toString()}`);
    } finally {
        fs.unlinkSync(tmp);
    }
});
console.log(allOk ? 'ALL INLINE SCRIPTS OK' : 'SYNTAX ERRORS FOUND');
