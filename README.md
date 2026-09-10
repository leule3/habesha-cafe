# my-cafe-app — Cloud (MongoDB) Multi-Tenant Server

This is the cloud version of the Habesha Café management system, organized
into a `src/` layout (config / models / controllers / routes / middleware).
Each café's data lives in **MongoDB Atlas** in the cloud, keyed by the
café's own id (`cafeId`). Multiple cafés (owners) can run against the same
database and each one gets a fully private, isolated store.

## Project layout

```
my-cafe-app/
├── src/
│   ├── config/db.js              # MongoDB Atlas connection
│   ├── controllers/
│   │   ├── authController.js     # Access-key mint/verify + key-status endpoint
│   │   ├── cafeController.js     # Read/save a cafe's state
│   │   ├── couponController.js   # Read-only coupon listing (write path TBD)
│   │   └── ownerController.js    # Owner Portal: owner login + staff management
│   ├── middleware/
│   │   ├── auth.js               # Multi-tenant + access-key checks
│   │   ├── ownerAuth.js          # Owner Portal session guard (Bearer token)
│   │   └── errorHandler.js       # Centralized error handling + 404
│   ├── models/
│   │   ├── Cafe.js, Employee.js, Coupon.js       (from your list)
│   │   ├── MenuItem.js, Order.js, AuditLog.js    (added — the mirror step needs them)
│   │   └── Owner.js              # The master owner account (added)
│   ├── routes/
│   │   ├── authRoutes.js, cafeRoutes.js, couponRoutes.js
│   │   └── ownerRoutes.js        # /api/owner/* (added)
│   ├── realtime/websocket.js     # Live sync (added — not in the original list)
│   ├── services/
│   │   ├── mirrorService.js      # Mirrors the state blob into normalized collections (was sync.js)
│   │   └── ownerSessionService.js # In-memory owner login sessions (added)
│   └── server.js                 # Entry point
├── scripts/                      # One-off/admin scripts (moved out of the project root)
│   ├── migrate_to_mongo.js
│   ├── reset_admin_password.js
│   └── fix_employee_passwords.js
├── public/                       # Frontend — main café app (index.html) + Owner Portal (owner.html)
├── .env.example
├── .gitignore
├── package.json                  # "start": "node src/server.js"
└── README.md
```

A few files exist beyond what you listed, because the app's live-sync and
data-mirroring features need somewhere to live: `models/MenuItem.js`,
`models/Order.js`, `models/AuditLog.js`, `realtime/websocket.js`, and
`services/mirrorService.js`. Everything else matches your structure.

**The main café app (`public/index.html`) still calls `GET`/`POST /api/state`,
which `cafeRoutes.js` mounts at the exact same path — the existing café
devices keep working unchanged.** A new page, `public/owner.html` (the
**Owner Portal**), was added on top of the same server.

## 1. What you need

- **Node.js** (LTS).
- A free **MongoDB Atlas** cluster — <https://www.mongodb.com/atlas>.
- (Optional) A cloud host (Render, Railway, Heroku…) for internet access.

## 2. One-time setup

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and set your Atlas connection string:

```
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/habesha-cafe
```

Optional: bring over a café that was previously saved to a local file:

```bash
npm run migrate                # reads data/state.json
npm run migrate -- path/to/cafe.json
```

## 3. Start the server

```bash
npm start      # runs: node src/server.js
```

Open http://localhost:3000 on the server computer, or
`http://<server-ip>:3000` from other computers on the same network. The
Order Queue, Dashboard and forms stay in sync live across all connected
screens.

## 4. Deploying to a cloud host (Render)

1. Point your Render project at this folder.
2. Build command: `npm install`
3. Start command: `node src/server.js`
4. Add to the host's **Environment** settings: `MONGO_URI` (required),
   leave `PORT` unset (Render sets it itself).
5. Deploy. The app and the WebSocket share the same origin, so no extra
   config is needed.

## 5. How multi-tenancy + auth work

- Each café has a permanent **tenant id**, kept in that café's browser
  (`localStorage` key `hc_cafe_id`), sent with every request.
- On top of that, every café has a random **access key** (24 random bytes),
  checked by `middleware/auth.js` on every `GET`/`POST /api/state` and on the
  WebSocket connection via the `X-Cafe-Key` header (or `?key=` for the
  socket, since browsers can't set custom WebSocket headers).
  - Minted the first time a café is created, or "claimed" the first time an
    older café (from before this existed) is touched — no manual migration
    needed.
  - Wrong or missing key on a café that already has one → `401`. Knowing or
    guessing a `cafeId` is no longer enough to read or overwrite someone
    else's café.
  - **Recovering a device that lost its key:** copy both `hc_cafe_id` and
    `hc_cafe_key` from `localStorage` on a working device into the new one
    (DevTools → Application → Local Storage).
- **This is a shared-secret, not a full login system** *for café staff*:
  employee/admin/HR login is checked entirely client-side in
  `public/index.html` against the employee list inside the state blob.
  The **Owner Portal** (`/owner.html`) is different — it has a real
  server-side owner account (scrypt-hashed password in the `owners`
  collection) and works across every café. Owner sessions are short-lived
  in-memory Bearer tokens (see `services/ownerSessionService.js`).

## 6. Database models

Split into one file per model under `src/models/`, all scoped by `cafeId`:

| Model | Collection | Holds (per café) |
| ----- | ---------- | ---------------- |
| `Cafe` | `cafes` | The full app state blob for one café (source of truth) |
| `Employee` | `employees` | Employee profiles, roles, status |
| `Coupon` | `coupons` | Per-employee coupon balances |
| `MenuItem` | `menuitems` | Menu + walk-in menu items |
| `Order` | `orders` | Order history |
| `AuditLog` | `auditlogs` | Activity log |

The web app still reads/writes its state as one JSON blob (`Cafe.state`);
`services/mirrorService.js` mirrors it (best-effort) into the other
collections so per-café entities can also be queried directly — e.g. via the
new read-only `GET /api/coupons?cafe=...` endpoint.

## 7. What's new vs. not-yet-implemented in this pass

- **New:** `GET /api/auth/status?cafe=...` — tells you whether a café id
  already has a key on file, without revealing the key.
- **New:** `GET /api/coupons?cafe=...` — read-only coupon balances from the
  mirrored collection.
- **Not implemented:** `POST /api/coupons/reset-weekly` returns `501`. There's
  no scheduler and no agreed rule yet for what a "weekly reset" should do —
  see the comment at the top of `controllers/couponController.js` before
  wiring it up.

## 8. Owner Portal (create café admins & HR accounts)

The **Owner Portal** lives at `/owner.html` on the same server. It is the
place for the website owner to manage every café.

**First time:** open `/owner.html` — since no owner account exists yet it
shows a **Create Owner Account** form. This creates the single master owner
account (stored with an scrypt-hashed password in MongoDB). Only one owner
account can ever exist.

**After signing in** you can:

- **Create a café** — adds a brand-new, isolated workspace (new `cafeId`,
  no access key yet). A café link is copied to your clipboard.
- **Link a café's computer** — open `index.html?cafe=<id>` on that café's
  own device (or use **Copy Café Link** / **Open Café**). The first time the
  device loads it, the server mints that café's access key and the app seeds
  its default data, so the same-origin apps just connect automatically.
- **Create / edit / reset / delete Café Admin and HR Manager credentials**
  for any café. These are written into the café's own `state.employees`,
  so they can sign in on the café app right away:
  - **Cafe Admin** → full café operation (Cafe Bureau, walk-in orders,
    wallet approvals, queue, financial reports).
  - **HR Manager** → HR & Night Approvals, employee roster, USB sync
    (HR/café package exchange), coupon-only reports.
- **Rotate a café's access key** — replaces the shared secret; café devices
  must then be re-linked with the new key.
- **Delete a café** — permanently removes the café and all of its mirrored
  data (requires typing the café id to confirm).

The per-café login screen also links to the Owner Portal
(`index.html` → "Owner Portal"). Owner sessions last 7 days in memory and are
lost if the server restarts — the owner just signs in again.

## Notes

- Never commit `.env` (already gitignored).
- Any HR/café data export (`cafe.json`, `fixed_cafe.json`, `fixed_hr.json`,
  or similar) contains real employee names and business data — gitignored,
  keep it out of the repo and out of anything you deploy.
- The local `data/` folder is also gitignored; Atlas is the source of truth.
- If the server can't reach Mongo it stops with a clear message — check
  `MONGO_URI` and that Atlas Network Access allows the server's IP (e.g.
  `0.0.0.0/0` for open access).
