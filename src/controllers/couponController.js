/**
 * Coupons & weekly resets.
 *
 * IMPORTANT — what's actually implemented today:
 * `listCoupons` is a genuinely new, read-only endpoint over the Coupon
 * collection that services/mirrorService.js already keeps in sync with each
 * cafe's state blob. There is still no separate WRITE path for coupons —
 * balances are edited in the main app UI and saved the normal way, through
 * POST /api/state, same as before.
 *
 * `resetWeeklyCoupons` is a stub. The original app has no scheduler and no
 * defined rules for what a "weekly reset" should do (which coupon types,
 * what timezone, whether it zeroes or rolls over). Rather than guess and
 * silently wipe real balances, this returns 501 until those rules are
 * decided. Wiring it up later means: pick a job runner (e.g. `node-cron`),
 * decide the reset rule, then have it call
 * `Coupon.updateMany({ cafeId }, { $set: { coupons: 0, nightCoupons: 0 } })`
 * (or whatever the real rule turns out to be) on a schedule.
 */
const Coupon = require('../models/Coupon');

// GET /api/coupons?cafe=xxx[&employee=yyy]
async function listCoupons(req, res) {
    try {
        const cafeId = req.cafeId;
        if (!cafeId) return res.status(400).json({ error: 'Missing cafe identifier.' });

        const filter = { cafeId };
        if (req.query.employee) filter.employeeId = req.query.employee.toString();

        const coupons = await Coupon.find(filter).select('-_id employeeId coupons nightCoupons regularCents nightCents');
        res.json({ cafe: cafeId, coupons });
    } catch (err) {
        console.error('GET /api/coupons error:', err.message);
        res.status(500).json({ error: 'Server error while reading coupon data.' });
    }
}

// POST /api/coupons/reset-weekly?cafe=xxx — NOT IMPLEMENTED, see note above.
async function resetWeeklyCoupons(req, res) {
    res.status(501).json({ error: 'Weekly coupon reset is not implemented yet — see the comment at the top of couponController.js.' });
}

module.exports = { listCoupons, resetWeeklyCoupons };
