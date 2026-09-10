// Diagnose full MongoDB connection error detail.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);
const fs = require('fs');
const log = (m) => fs.appendFileSync(require('path').join(__dirname, 'diag.txt'), m + '\n');

(async () => {
  const mongoose = require('mongoose');
  const cfg = require('dotenv').config({ path: require('path').join(__dirname, '.env') });
  const uri = (cfg.parsed && cfg.parsed.MONGO_URI || '').trim();
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    log('CONNECTED OK');
    process.exit(0);
  } catch (e) {
    log('FULL error name: ' + e.name);
    log('FULL error message: ' + e.message);
    log('Case: ' + (/Authentication.failed/i.test(e.message) ? 'AUTH-FAILURE' : (/connect/.test(e.message) ? 'NETWORK/TIMEOUT' : 'OTHER')));
    log('stack head:');
    log((e.stack || '').split('\n').slice(0, 4).join('\n'));
    // The driver nests per-server connection errors under e.reason / e.errors.
    log('--- e.reason ---');
    log(JSON.stringify(e.reason, null, 2));
    log('--- e.errors (server map) ---');
    if (e.errors) {
      for (const k of Object.keys(e.errors)) {
        const s = e.errors[k];
        log('server=' + k + ' code=' + s.code + ' reason=' + (s.reason || '').match ? (s.reason && s.reason.codeName) : s);
        log('  msg: ' + (s.message || ''));
        log('  reason.message: ' + (s.reason && s.reason.message || ''));
        log('  reason.errorLabels: ' + JSON.stringify((s.reason && s.reason.errorLabels) || []));
      }
    } else {
      log('(no e.errors)');
    }
    process.exit(1);
  }
})();