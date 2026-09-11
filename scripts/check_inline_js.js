// One-off helper: extracts every inline <script> block from the public HTML
// pages and syntax-checks them with node --check. Safe to delete afterwards.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pages = ['public/index.html', 'public/owner.html'];
let failed = false;

for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const blocks = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) blocks.push(m[1]);
    blocks.forEach((code, i) => {
        const tmp = path.join('.check_tmp_' + i + '.js');
        fs.writeFileSync(tmp, code);
        try {
            execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
            console.log(`OK      ${page} [script ${i}] (${code.length} chars)`);
        } catch (e) {
            failed = true;
            console.log(`FAIL    ${page} [script ${i}]\n${e.stderr}`);
        } finally {
            try { fs.unlinkSync(tmp); } catch (e) {}
        }
    });
}
console.log(failed ? 'SYNTAX CHECK FAILED' : 'ALL SCRIPT BLOCKS PARSE OK');
process.exit(failed ? 1 : 0);
