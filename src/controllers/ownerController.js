/**
 * Owner Portal logic — multi-cafe administration.
 *
 * The Owner Portal (/owner.html) is for the person who runs the whole
 * system. It lets them:
 *   - create the first (and only) Owner account,
 *   - sign in / out (in-memory token sessions, see services/ownerSessionService.js),
 *   - list every cafe in the shared MongoDB,
 *   - create brand-new cafes,
 *   - create / edit / reset / delete **Cafe Admin** and **HR Manager**
 *     credentials inside any cafe,
 *   - rotate a cafe's access key, and delete a cafe entirely.
 *
 * Staff credentials are written into the cafe's own state blob
 * (Cafe.state.employees), which is the exact place the per-cafe web app
 * (public/index.html) checks at login — so an account created here can
 * immediately sign in on that cafe's devices. The staff password scheme
 * MUST match the client: the browser verifies `sha256(password + salt)`
 * with a pure-JS implementation, so we reproduce the same hex digest here
 * with Node's built-in crypto.
 */
const crypto = require('crypto');
const Cafe = require('../models/Cafe');
const Owner = require('../models/Owner');
const Employee = require('../models/Employee');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const AuditLog = require('../models/AuditLog');
const { generateAccessKey } = require('./authController');
const { mirrorCafeState } = require('../services/mirrorService');
const { broadcast } = require('../realtime/websocket');
const { createSession, deleteSession } = require('../services/ownerSessionService');
const { tokenOf } = require('../middleware/ownerAuth');

const VALID_STAFF_ROLES = ['admin', 'hr'];
const ROLE_LABELS = { admin: 'Cafe Admin', hr: 'HR Manager' };

// ---------------------------------------------------------------------------
// Owner passwords (server-side scrypt — independent from staff passwords).
// ---------------------------------------------------------------------------

function ownerHash(password, salt) {
    return crypto.scryptSync(String(password), String(salt), 64).toString('hex');
}

function makeOwnerPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: ownerHash(password, salt) };
}

function ownerPasswordMatches(owner, password) {
    if (!owner || !owner.salt || !owner.hash) return false;
    const stored = Buffer.from(owner.hash, 'hex');
    const provided = Buffer.from(ownerHash(password, owner.salt), 'hex');
    return stored.length === provided.length && crypto.timingSafeEqual(stored, provided);
}

// ---------------------------------------------------------------------------
// Staff passwords (MUST match the frontend: hex(sha256(password + salt))).
// ---------------------------------------------------------------------------

function staffPasswordHash(password, salt) {
    return crypto.createHash('sha256').update(String(password) + String(salt)).digest('hex');
}

// ---------------------------------------------------------------------------
// Cafe.state helpers.
// ---------------------------------------------------------------------------

function emptyState(cafeId) {
    return {
        version: 7,
        siteId: cafeId,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        employees: [],
        menu: [],
        walkinMenu: [],
        orders: [],
        transfers: [],
        audit: [],
        dailyQuote: '',
        lastWeeklyRefresh: null,
        weeklyArchives: [],
        ranking: [], // all-time employee ranking totals (survives week archives)
        paymentAccounts: {
            cbeName: 'Evlogia cafe & Restaurant',
            cbeNumber: '1000639156722',
            telebirrName: 'Evlogia cafe & Restaurant Enterprise',
            telebirrNumber: '0912792546'
        }
    };
}

// Loads the cafe, creating it (with a null state and version 0) if needed.
// A brand-new owner-created cafe keeps `state: null`, `version: 0` AND no
// access key on purpose: when that cafe's own device first opens
// ".../?cafe=<id>", the access-key claim path in authController mints the
// key, POST /api/state with baseVersion 0 succeeds, and the client seeds it
// the normal way. Minting a key here would lock the new device out.
async function getOrInitCafe(cafeId) {
    let doc = await Cafe.findOne({ cafeId });
    if (!doc) {
        doc = new Cafe({ cafeId, accessKey: null, state: null, version: 0 });
        await doc.save();
        return doc;
    }
    // Old/foreign state blobs that lack the employees array get repaired so
    // staff management can always reason about a real list.
    if (!doc.state || !Array.isArray(doc.state.employees)) {
        const existing = doc.state && typeof doc.state === 'object' ? doc.state : {};
        doc.state = Object.assign({}, emptyState(cafeId), existing, {
            employees: Array.isArray(existing.employees) ? existing.employees : [],
            siteId: existing.siteId || cafeId
        });
        doc.markModified('state');
        doc.version = (doc.version || 0) + 1;
        await doc.save();
    }
    return doc;
}

async function persistCafe(doc, auditAction) {
    doc.state.lastModified = new Date().toISOString();
    if (auditAction && Array.isArray(doc.state.audit)) {
        doc.state.audit.push({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: 'OWNER', action: auditAction });
    }
    doc.version = (doc.version || 0) + 1;
    // `state` is a Mongoose Mixed field — in-place mutations (push / field set)
    // are not tracked automatically, so tell Mongoose the whole blob changed.
    doc.markModified('state');
    await doc.save();
    // Keep the normalized collections and live screens in sync, exactly like
    // POST /api/state does — best effort, never blocking.
    mirrorCafeState(doc.state, doc.cafeId);
    broadcast(doc.cafeId, { type: 'state', state: doc.state, version: doc.version });
}

function staffEmployees(state) {
    if (!state || !Array.isArray(state.employees)) return [];
    return state.employees.filter((e) => e && (e.role === 'admin' || e.role === 'hr'));
}

function summarizeCafe(doc) {
    const state = doc.state && typeof doc.state === 'object' ? doc.state : {};
    const employees = Array.isArray(state.employees) ? state.employees : [];
    const staff = staffEmployees(state).map((e) => ({
        id: e.id,
        username: e.username,
        name: e.name || '',
        role: e.role
    }));
    return {
        cafeId: doc.cafeId,
        label: doc.label || null,
        accessKey: doc.accessKey || null,
        hasState: !!doc.state,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        counts: {
            employees: employees.filter((e) => e && e.role === 'employee').length,
            admins: staff.filter((s) => s.role === 'admin').length,
            hrs: staff.filter((s) => s.role === 'hr').length,
            orders: Array.isArray(state.orders) ? state.orders.length : 0,
            menu: Array.isArray(state.menu) ? state.menu.length : 0
        },
        staff
    };
}

function publicOwner(o) {
    return { username: o.username, name: o.name || '' };
}

// ---------------------------------------------------------------------------
// Endpoints.
// ---------------------------------------------------------------------------

// GET /api/owner/status -> { hasOwner }
async function getStatus(req, res) {
    try {
        const count = await Owner.countDocuments();
        res.json({ hasOwner: count > 0 });
    } catch (err) {
        console.error('GET /api/owner/status error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
}

// POST /api/owner/setup — create the first Owner account. Only works while
// zero owners exist, so the person who deploys the system claims it first.
async function setup(req, res) {
    try {
        const count = await Owner.countDocuments();
        if (count > 0) {
            return res.status(409).json({ error: 'An Owner account already exists. Sign in instead.' });
        }
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const name = String(req.body.name || '').trim();
        if (!username || !/^[a-z0-9_.-]{3,}$/.test(username)) {
            return res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, dot, dash, underscore).' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        const creds = makeOwnerPassword(password);
        const owner = await Owner.create({ username, name, salt: creds.salt, hash: creds.hash });
        res.json({ ok: true, owner: publicOwner(owner) });
    } catch (err) {
        if (err && err.code === 11000) return res.status(409).json({ error: 'That username is already taken.' });
        console.error('POST /api/owner/setup error:', err.message);
        res.status(500).json({ error: 'Could not create the Owner account.' });
    }
}

// POST /api/owner/login -> { token, owner }
async function login(req, res) {
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        if (!username || !password) {
            return res.status(400).json({ error: 'Enter both username and password.' });
        }
        const owner = await Owner.findOne({ username });
        if (!owner || !ownerPasswordMatches(owner, password)) {
            return res.status(401).json({ error: 'Invalid owner username or password.' });
        }
        res.json({ token: createSession(owner), owner: publicOwner(owner) });
    } catch (err) {
        console.error('POST /api/owner/login error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
}

// POST /api/owner/logout
async function logout(req, res) {
    try {
        deleteSession(tokenOf(req));
        res.json({ ok: true });
    } catch (err) {
        console.error('POST /api/owner/logout error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
}

// GET /api/owner/me
async function me(req, res) {
    try {
        const owner = await Owner.findById(req.ownerSession.ownerId);
        if (!owner) {
            return res.status(401).json({ error: 'Owner account no longer exists.' });
        }
        res.json({ owner: publicOwner(owner) });
    } catch (err) {
        console.error('GET /api/owner/me error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
}

// GET /api/owner/cafes -> { cafes: [...] }
async function listCafes(req, res) {
    try {
        const docs = await Cafe.find({}).sort({ updatedAt: -1 }).lean();
        res.json({ cafes: docs.map(summarizeCafe) });
    } catch (err) {
        console.error('GET /api/owner/cafes error:', err.message);
        res.status(500).json({ error: 'Could not list cafes.' });
    }
}

// POST /api/owner/cafes — create a brand-new cafe workspace.
async function createCafe(req, res) {
    try {
        const label = String(req.body.label || '').trim();
        let cafeId = String(req.body.cafeId || '').trim();
        if (cafeId && !/^[A-Za-z0-9_-]+$/.test(cafeId)) {
            return res.status(400).json({ error: 'cafeId may only contain letters, numbers, dash or underscore.' });
        }
        if (!cafeId) cafeId = 'cafe_' + crypto.randomUUID();
        const existing = await Cafe.findOne({ cafeId });
        if (existing) return res.status(409).json({ error: 'A cafe with that id already exists.' });

        // accessKey is intentionally left null: the first device to open
        // ".../?cafe=<id>" claims it (see authController.verifyOrClaimKey).
        const doc = await Cafe.create({ cafeId, label: label || null, accessKey: null, state: null, version: 0 });
        res.json({
            cafe: summarizeCafe(doc.toObject()),
            origin: `${req.protocol}://${req.get('host')}`
        });
    } catch (err) {
        console.error('POST /api/owner/cafes error:', err.message);
        res.status(500).json({ error: 'Could not create the cafe.' });
    }
}

// POST /api/owner/cafes/:cafeId/staff — create a Cafe Admin or HR account.
async function createStaff(req, res) {
    try {
        const cafeId = String(req.params.cafeId || '').trim();
        const username = String(req.body.username || '').trim();
        const name = String(req.body.name || '').trim();
        const role = String(req.body.role || '').trim();
        const password = String(req.body.password || '');

        if (!cafeId) return res.status(400).json({ error: 'Missing cafe id.' });
        if (!VALID_STAFF_ROLES.includes(role)) {
            return res.status(400).json({ error: 'role must be "admin" or "hr".' });
        }
        if (!/^[A-Za-z0-9_.-]{3,}$/.test(username)) {
            return res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, dot, dash, underscore).' });
        }
        if (!name) return res.status(400).json({ error: 'Full name is required.' });
        if (password.length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters.' });

        const doc = await getOrInitCafe(cafeId);
        if (doc.state.employees.some((e) => e && String(e.username).toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ error: 'A user with that username already exists in this cafe.' });
        }

        const salt = crypto.randomUUID();
        doc.state.employees.push({
            id: crypto.randomUUID(),
            username,
            name,
            role,
            status: 'At Work',
            coupons: 0,
            nightCoupons: 0,
            regularCents: 0,
            nightCents: 0,
            walletCents: 0,
            walletDepositRequested: 0,
            nightRequested: false,
            pw: { salt, hash: staffPasswordHash(password, salt) }
        });

        await persistCafe(doc, `OWNER_CREATED_${role.toUpperCase()}_STAFF`);
        const created = staffEmployees(doc.state).find((s) => s.username === username);
        res.json({ staff: { id: created.id, username: created.username, name: created.name, role: created.role } });
    } catch (err) {
        console.error('POST /api/owner/cafes/:cafeId/staff error:', err.message);
        res.status(500).json({ error: 'Could not create the staff account.' });
    }
}

// PUT /api/owner/cafes/:cafeId/staff/:username — rename / change role / reset password.
async function updateStaff(req, res) {
    try {
        const cafeId = String(req.params.cafeId || '').trim();
        const username = String(req.params.username || '').trim();
        const doc = await getOrInitCafe(cafeId);
        const emp = doc.state.employees.find(
            (e) => e && String(e.username).toLowerCase() === username.toLowerCase() && VALID_STAFF_ROLES.includes(e.role)
        );
        if (!emp) {
            return res.status(404).json({ error: 'Staff account not found (only Cafe Admin / HR accounts can be edited here).' });
        }

        if (req.body.name != null) {
            const name = String(req.body.name).trim();
            if (name) emp.name = name;
        }
        if (req.body.role != null) {
            if (!VALID_STAFF_ROLES.includes(req.body.role)) {
                return res.status(400).json({ error: 'role must be "admin" or "hr".' });
            }
            emp.role = req.body.role;
        }
        if (req.body.password != null && String(req.body.password) !== '') {
            if (String(req.body.password).length < 3) {
                return res.status(400).json({ error: 'New password must be at least 3 characters.' });
            }
            const salt = crypto.randomUUID();
            emp.pw = { salt, hash: staffPasswordHash(req.body.password, salt) };
        }

        await persistCafe(doc, 'OWNER_UPDATED_STAFF');
        res.json({ staff: { id: emp.id, username: emp.username, name: emp.name, role: emp.role } });
    } catch (err) {
        console.error('PUT /api/owner/cafes/:cafeId/staff/:username error:', err.message);
        res.status(500).json({ error: 'Could not update the staff account.' });
    }
}

// DELETE /api/owner/cafes/:cafeId/staff/:username
async function deleteStaff(req, res) {
    try {
        const cafeId = String(req.params.cafeId || '').trim();
        const username = String(req.params.username || '').trim();
        const doc = await getOrInitCafe(cafeId);
        const idx = doc.state.employees.findIndex(
            (e) => e && String(e.username).toLowerCase() === username.toLowerCase() && VALID_STAFF_ROLES.includes(e.role)
        );
        if (idx === -1) {
            return res.status(404).json({ error: 'Staff account not found (only Cafe Admin / HR accounts can be deleted here).' });
        }
        doc.state.employees.splice(idx, 1);
        await persistCafe(doc, 'OWNER_DELETED_STAFF');
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/owner/cafes/:cafeId/staff/:username error:', err.message);
        res.status(500).json({ error: 'Could not delete the staff account.' });
    }
}

// POST /api/owner/cafes/:cafeId/rotate-key — replace the cafe's access key.
async function rotateKey(req, res) {
    try {
        const cafeId = String(req.params.cafeId || '').trim();
        if (!cafeId) return res.status(400).json({ error: 'Missing cafe id.' });
        const doc = await getOrInitCafe(cafeId);
        doc.accessKey = generateAccessKey();
        await doc.save();
        res.json({
            cafeId,
            accessKey: doc.accessKey,
            note: 'Cafe devices must be switched to the new access key (copy it from the Owner Portal).'
        });
    } catch (err) {
        console.error('POST /api/owner/cafes/:cafeId/rotate-key error:', err.message);
        res.status(500).json({ error: 'Could not rotate the access key.' });
    }
}

// DELETE /api/owner/cafes/:cafeId — permanently remove a cafe (dangerous).
async function deleteCafe(req, res) {
    try {
        const cafeId = String(req.params.cafeId || '').trim();
        if (!cafeId) return res.status(400).json({ error: 'Missing cafe id.' });
        const doc = await Cafe.findOne({ cafeId });
        if (!doc) return res.status(404).json({ error: 'Cafe not found.' });

        await Cafe.deleteOne({ _id: doc._id });
        // Keep the mirrored normalized collections from serving stale data.
        await Promise.all([
            Employee.deleteMany({ cafeId }),
            Coupon.deleteMany({ cafeId }),
            MenuItem.deleteMany({ cafeId }),
            Order.deleteMany({ cafeId }),
            AuditLog.deleteMany({ cafeId })
        ]);
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/owner/cafes/:cafeId error:', err.message);
        res.status(500).json({ error: 'Could not delete the cafe.' });
    }
}

module.exports = {
    getStatus,
    setup,
    login,
    logout,
    me,
    listCafes,
    createCafe,
    createStaff,
    updateStaff,
    deleteStaff,
    rotateKey,
    deleteCafe,
    ROLE_LABELS
};