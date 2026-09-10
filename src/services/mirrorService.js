/**
 * Mirrors the per-cafe operational blob (Cafe.state) into the normalized,
 * multi-tenant collections (Employee, MenuItem, Coupon, Order, AuditLog).
 * Renamed from sync.js -> services/mirrorService.js during the src/ restructure.
 *
 * Every mirror writes clear + insert for the given cafeId only, so each cafe's
 * normalized collections stay up to date and isolated. This is best-effort: a
 * failure here must never break the primary state save, so it is wrapped in a
 * try/catch (and stations as a non-fatal error to the caller).
 */
const Employee = require('../models/Employee');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const AuditLog = require('../models/AuditLog');

const asArray = (x) => (Array.isArray(x) ? x : []);

async function mirrorCafeState(state, cafeId) {
    try {
        const employees = asArray(state && state.employees);
        const menu = asArray(state && state.menu);
        const walkinMenu = asArray(state && state.walkinMenu);
        const orders = asArray(state && state.orders);
        const audit = asArray(state && state.audit);

        // Employees + their coupon balances (one pass, same cafeId).
        await Employee.deleteMany({ cafeId });
        await Coupon.deleteMany({ cafeId });
        if (employees.length) {
            await Employee.insertMany(
                employees.map((e) => ({
                    cafeId,
                    employeeId: e.id,
                    username: typeof e.username === 'string' ? e.username : undefined,
                    name: typeof e.name === 'string' ? e.name : undefined,
                    role: typeof e.role === 'string' ? e.role : undefined,
                    status: typeof e.status === 'string' ? e.status : undefined,
                    data: e
                })),
                { ordered: false }
            );
            await Coupon.insertMany(
                employees.map((e) => ({
                    cafeId,
                    employeeId: e.id,
                    coupons: Number(e.coupons) || 0,
                    nightCoupons: Number(e.nightCoupons) || 0,
                    regularCents: Number(e.regularCents) || 0,
                    nightCents: Number(e.nightCents) || 0
                })),
                { ordered: false }
            );
        }

        // Menu items: both the main menu and the walk-in menu.
        await MenuItem.deleteMany({ cafeId });
        const menuItems = [];
        for (const m of menu) {
            if (m) menuItems.push({ id: m.id, name: m.name, price: m.price, available: m.available, sort: m.sortOrder != null ? m.sortOrder : m.sort, scope: 'menu' });
        }
        for (const m of walkinMenu) {
            if (m) menuItems.push({ id: m.id, name: m.name, price: m.price, available: m.available, sort: m.sortOrder != null ? m.sortOrder : m.sort, scope: 'walkin' });
        }
        if (menuItems.length) {
            await MenuItem.insertMany(
                menuItems.map((m) => ({
                    cafeId,
                    itemId: m.id,
                    name: m.name,
                    price: m.price,
                    available: m.available,
                    sort: m.sort,
                    scope: m.scope
                })),
                { ordered: false }
            );
        }

        // Orders
        await Order.deleteMany({ cafeId });
        if (orders.length) {
            await Order.insertMany(
                orders.map((o) => ({
                    cafeId,
                    orderId: o.id,
                    groupId: typeof o.groupId === 'string' ? o.groupId : undefined,
                    at: o.at ? new Date(o.at) : undefined,
                    customer: typeof o.customer === 'string' ? o.customer : undefined,
                    employeeId: typeof o.employeeId === 'string' ? o.employeeId : undefined,
                    itemId: typeof o.itemId === 'string' ? o.itemId : undefined,
                    itemName: typeof o.itemName === 'string' ? o.itemName : undefined,
                    total: Number(o.total) || 0,
                    payment: typeof o.payment === 'string' ? o.payment : undefined,
                    served: Boolean(o.served)
                })),
                { ordered: false }
            );
        }

        // Audit log
        await AuditLog.deleteMany({ cafeId });
        if (audit.length) {
            await AuditLog.insertMany(
                audit.map((a) => ({
                    cafeId,
                    id: a.id,
                    at: a.at ? new Date(a.at) : undefined,
                    actor: typeof a.actor === 'string' ? a.actor : undefined,
                    action: typeof a.action === 'string' ? a.action : undefined
                })),
                { ordered: false }
            );
        }

        return true;
    } catch (err) {
        // Mirroring is only a convenience — never let it break the state save.
        console.error('[mirror] normalized collections not updated for cafe', cafeId, ':', err.message);
        return false;
    }
}

module.exports = { mirrorCafeState };