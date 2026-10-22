# AttendX — Staff Attendance Management System

AttendX is a full-stack attendance tracker for a single organisation. Staff clock in and
out on a shared tablet at the entrance using a 4-digit PIN, while HR and management sign
in to a web dashboard to see who is in today, fix mistakes, manage employees, and export
reports.

Everything runs from one Express API and one PostgreSQL database. In development the React
app is served by Vite with the API proxied to port `4000`; in production Express serves the
built React bundle and the API together on a single port.

---

## Table of contents

- [What you get](#what-you-get)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [How attendance rules work](#how-attendance-rules-work)
- [Demo logins](#demo-logins)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Production build](#production-build)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Not built yet](#not-built-yet)

---

## What you get

Two interfaces, one backend:

| Interface | Dev URL | Who uses it |
|---|---|---|
| **Attendance Kiosk** | http://localhost:5173/ | Staff, at the entrance tablet — punches in/out with a PIN |
| **Admin Dashboard** | http://localhost:5173/admin | HR / management — dashboard, history, employees, reports, settings |

### Kiosk

- Live clock/date, company name and terminal ID from environment variables.
- **Clock In** / **Clock Out** with a 4-digit PIN on an on-screen keypad
  (a physical keyboard works too).
- Friendly result screen with a 10-second auto-return to the keypad.
- Clear error states: wrong PIN, already clocked in, no clock-in found, network error.
- Online/offline indicator so staff know when the server is unreachable.
- Brute-force protection: an account is locked out after 10 failed attempts within 5 minutes.

### Admin dashboard

- **Login** — JWT auth with bcrypt-hashed passwords and rate-limited attempts.
- **Dashboard** — headcount and today's attendance at a glance, plus a live list of today's punches.
- **Attendance** — browse by date/department/status, search, and correct a record with a
  mandatory reason (corrections are flagged and written to the audit log).
- **Employees** — list, add, edit, deactivate, and open a profile with
  Overview / Attendance / Schedule / Activity tabs. Set or reset an employee's PIN here.
- **Reports** — daily, weekly, and monthly summaries with Excel and CSV export.
- **Settings** — default work rules, departments, and the audit log.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, React Router, Tailwind CSS, Vite, lucide-react icons |
| Backend | Node.js (ES modules), Express 5, helmet, cors, express-rate-limit |
| Database | PostgreSQL 14+ accessed with `pg` (connection pooling) |
| Auth | JWT (`jsonwebtoken`) for admins, bcrypt for passwords, HMAC-SHA256 for PINs |
| Exports | ExcelJS (`.xlsx`) and hand-built CSV |

---

## Requirements

- **Node.js 18 or newer** (built with Node 22)
- **PostgreSQL 14 or newer**, running locally or reachable over the network

Any local PostgreSQL install works — Docker is not required (and no container setup ships
with this repo).

---

## Quick start

### 1. Create the database

Create an empty database (the schema is applied in step 3):

```bash
createdb "AttendX"
```

Or from `psql` / pgAdmin:

```sql
CREATE DATABASE "AttendX";
```

> **Watch the case.** `PGDATABASE=AttendX` is sent to PostgreSQL verbatim, so the database
> must be named exactly `AttendX` (it was created with quotes above). A database named
> `attendx` will *not* be found. If you would rather use lowercase, create `attendx` and
> set `PGDATABASE=attendx` to match.

### 2. Configure the backend

```bash
cp server/.env.example server/.env
```

Then open `server/.env` and fill in:

- the `PG*` connection values (host, port, user, password, database),
- a real `JWT_SECRET` and `PIN_SECRET` (see [generating secrets](#generating-secrets)).

### 3. Install dependencies and set up the schema

```bash
npm run install:all   # installs server/ and client/ packages
npm run db:setup      # creates the tables, then seeds demo data
```

`npm run db:setup` runs the schema, then the seed script, which **wipes existing data**
and inserts 248 employees plus roughly 45 days of attendance history.

### 4. Run it

Use two terminals:

```bash
npm run dev:server    # API on http://localhost:4000
npm run dev:client    # React app on http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173/ for the kiosk and http://localhost:5173/admin for the
dashboard. A quick sanity check that the API and database are talking:

```bash
curl http://localhost:4000/api/health
# {"ok":true,"time":"...","timezone":"Africa/Lagos"}
```

---

## Environment variables

Only the two `.env` files are read; both are git-ignored. The `.env.example` files are
committed and safe to copy.

### `server/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `4000` | Port the Express API listens on. |
| `PGHOST` | yes | — | PostgreSQL host, e.g. `localhost`. |
| `PGPORT` | no | `5432` | PostgreSQL port. |
| `PGUSER` | yes | — | Database user. |
| `PGPASSWORD` | yes | — | Database password. |
| `PGDATABASE` | yes | — | Database name (case-sensitive, e.g. `AttendX`). |
| `JWT_SECRET` | yes | — | Signs admin session tokens. Changing it logs out every admin. |
| `PIN_SECRET` | yes | — | Keys the HMAC that protects employee PINs. Changing it invalidates existing PINs. |
| `APP_TIMEZONE` | no | `Africa/Lagos` | Timezone used to judge "on time", the work date, and reports. |
| `CLIENT_ORIGIN` | no | allow all | Comma-separated list of allowed browser origins, e.g. `http://localhost:5173`. Leave empty in development. |

> If `JWT_SECRET` or `PIN_SECRET` is missing, the server falls back to an insecure built-in
> development value and logs in fine — which makes it easy to forget. Always set both before
> exposing the app to anyone else.

The backend deliberately uses the standard libpq `PG*` variables instead of a single
`DATABASE_URL`, so the `psql`/`pg_dump` command line tools pick up the exact same settings.
With no explicit pool config, `pg` reads them automatically.

### `client/.env`

Optional — the app runs without it. These values are visible in the browser bundle, so
never put secrets here (Vite only exposes variables prefixed with `VITE_`).

| Variable | Default | Purpose |
|---|---|---|
| `VITE_COMPANY_NAME` | `THE VALERIE BRAND` | Company name shown on the kiosk header. |
| `VITE_TERMINAL_ID` | `K-102` | Terminal identifier shown on the kiosk. |

### Generating secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice — once for `JWT_SECRET`, once for `PIN_SECRET` — or use
`openssl rand -base64 48`.

---

## Available scripts

Run these from the project root:

| Script | What it does |
|---|---|
| `npm run install:all` | Installs dependencies for both `server/` and `client/`. |
| `npm run db:setup` | Applies `schema.sql`, then seeds demo data (destructive). |
| `npm run dev:server` | Starts the API with `node --watch` (auto-restarts on changes). |
| `npm run dev:client` | Starts the Vite dev server on port `5173`. |
| `npm run build` | Builds the React app into `client/dist`. |
| `npm start` | Starts the API in production mode, serving `client/dist`. |

Inside `server/` you can also run `npm run db:init` (schema only) or `npm run db:seed`
(data only, destructive).

---

## How attendance rules work

Rules are stored per employee (`expected_in`, `expected_out`, `grace_minutes`, `work_schedule`),
so nothing is hard-coded — the values come from Settings or the employee form.

- **Clock-in** at or before `expected_in + grace_minutes` → `on_time` (early arrivals count).
- **Clock-in** after that → `late`.
- **Worked time under 4 hours** → `half_day`, regardless of the clock-in status.
- **Clock-out before** `expected_out` → the `early_departure` flag is set.
- **No punch at all** → `absent`, or `on_leave` when the employee is marked as on leave.
- **Admin corrections** are saved with a mandatory reason and flagged `corrected`, so the
  original automatic result is never silently overwritten.

Every timestamp is evaluated in `APP_TIMEZONE`, using server time — never the tablet's
clock. The "work date" is the local date of the punch, which is why clock-outs after
midnight still land on the right day.

---

## Demo logins

Seeded by `npm run db:seed`:

- **Admin:** `hr@attendx.com` / `AttendX@2026` (pre-filled on the login page)
- **Kiosk PINs:** Sarah Johnson `1234`, David Kross `2345` — both have no punch yet today,
  so you can try Clock In → Clock Out. Every other seeded employee gets a random PIN;
  set or reset any PIN from *Employees → Edit*.
- Re-running `npm run db:seed` resets everything, including today's punches.

> Clocking out right after clocking in records under 4 hours worked, so it correctly shows
> **Half Day**.

---

## Project structure

```
attendx/
├── client/                    React app (Vite)
│   ├── src/
│   │   ├── pages/             Kiosk, Login, Dashboard, Attendance, Employees,
│   │   │                      EmployeeForm, EmployeeProfile, Reports, Settings
│   │   ├── components/        AdminLayout, ui (Avatar, StatusBadge, Pagination, Modal …)
│   │   ├── api.js             Fetch wrapper: JWT header, error handling, downloads
│   │   ├── auth.jsx           Auth context / route guard
│   │   └── utils.js           Formatting helpers
│   ├── tailwind.config.js     Brand palette (peach #F2D9CE, clay #A87967)
│   └── vite.config.js         Dev server + /api proxy to :4000
├── server/                    Express API
│   └── src/
│       ├── index.js           App setup, routes, static build serving
│       ├── db.js              pg pool + type parsers (dates stay YYYY-MM-DD)
│       ├── schema.sql         Tables, constraints, indexes
│       ├── initDb.js          Applies the schema
│       ├── seed.js            Destructive demo data generator
│       ├── middleware.js      JWT auth guard, error helpers
│       ├── routes/            auth · kiosk · dashboard · attendance · employees
│       │                      · reports · settings
│       └── lib/               time · attendance rules · pin · export · audit
└── package.json               Root convenience scripts
```

---

## API overview

All endpoints are under `/api`. Admin endpoints require an `Authorization: Bearer <token>`
header; kiosk endpoints are public but rate-limited.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Liveness plus a database round-trip (`503` if the DB is down). |
| `POST /api/auth/login` | public | Email + password → JWT. |
| `GET /api/auth/me` | admin | Current admin profile. |
| `POST /api/kiosk/punch` | public | Clock in/out by PIN; returns the employee, action, and status. |
| `GET /api/dashboard/stats` | admin | Headcount and today's totals. |
| `GET /api/dashboard/today` | admin | Today's attendance rows. |
| `GET /api/attendance` | admin | Paginated history with date/department/status/search filters. |
| `GET /api/attendance/export` | admin | CSV/XLSX export of the filtered history. |
| `POST /api/attendance` · `PUT /api/attendance/:id` | admin | Add or correct a record (reason required). |
| `GET /api/employees` · `GET /api/employees/:id` | admin | List or fetch an employee. |
| `GET /api/employees/next-code` | admin | Suggest the next employee code. |
| `POST /api/employees` · `PUT /api/employees/:id` · `DELETE /api/employees/:id` | admin | Create, update, deactivate. |
| `GET /api/reports/summary` | admin | Daily/weekly/monthly report data. |
| `GET /api/reports/export` | admin | CSV/XLSX report export. |
| `GET /api/meta` | admin | Departments, settings, and reference data. |
| `PUT /api/settings` | admin | Update default rules. |
| `POST /api/departments` | admin | Add a department. |
| `GET /api/audit` | admin | Audit log. |

---

## Production build

```bash
npm run install:all
npm run build          # bundles the client into client/dist
npm start              # Express serves the API and the built app on :4000
```

Open http://localhost:4000 — the kiosk is at `/`, the dashboard at `/admin`. When
`client/dist` exists, Express serves it automatically and falls back to `index.html` for
client-side routes.

Before going live:

- Set `CLIENT_ORIGIN` to your real domain(s) so CORS is not wide open.
- Use long, unique values for `JWT_SECRET` and `PIN_SECRET`, and never commit `.env`.
- Terminate TLS in front of the app (reverse proxy or hosting platform), and run
  PostgreSQL with a dedicated, least-privilege user rather than `postgres`.
- Point the tablet at the kiosk URL and enable the device's kiosk/guided-access mode.

---

## Troubleshooting

**Vite logs `http proxy error: /api/health ... ECONNREFUSED`**
The API isn't running on port `4000`. Start `npm run dev:server` in a second terminal.
Check http://localhost:4000/api/health directly.

**`/api/health` returns `{"ok":false}` with status `503`**
The API is up but cannot reach PostgreSQL. Re-check `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`,
confirm the server is running, and make sure the database name matches in case (`AttendX`).

**`database "AttendX" does not exist`**
The database was created as lowercase `attendx`. Either create `"AttendX"` (quoted) or set
`PGDATABASE=attendx`.

**`password authentication failed for user ...`**
The `PGUSER`/`PGPASSWORD` pair in `server/.env` doesn't match a PostgreSQL role. Test it
directly: `psql -h localhost -U <user> -d "AttendX" -c "select 1"`.

**Admin login fails after pulling new config**
If `JWT_SECRET` changed, old tokens are invalid — log in again. If `PIN_SECRET` changed,
employee PINs must be reset from *Employees → Edit* because previous hashes no longer match.

**Employees have no PIN / kiosk always says incorrect PIN**
PINs are only set by the seed script or by an admin. Open *Employees → Edit* and set one.

**`db:setup` deleted my data**
By design — `db:seed` truncates and reseeds. Run only `npm run db:init` in `server/` to
apply schema changes without touching rows.

---

## Security notes

- Admin passwords are bcrypt hashes; login attempts are rate-limited per IP.
- Employee PINs are never stored in plain text and never returned by the API — only an
  HMAC-SHA256 digest keyed with `PIN_SECRET` is stored. PINs are also unique across employees.
- Admin routes are protected by JWT; the token is sent in the `Authorization` header.
- Kiosk punch attempts are rate-limited and an employee is locked out after repeated failures.
- Corrections and other sensitive actions are recorded in `audit_logs` with the admin's
  name and a reason.
- `.env` files are git-ignored; only `.env.example` files are tracked.

---

## Not built yet

Ideas that are intentionally out of scope for this version:

- Kiosk offline queue (punches are rejected with "Connection unavailable" while offline).
- A nightly job to mark absences and auto clock-out after N hours (today these are seeded
  or set by an admin correction).
- Profile photo upload (photos are an optional URL; initials avatars are shown otherwise).
- Multiple admin roles / super-admin, password reset, leave requests, payroll integration.
- Biometric or RFID clock-in, and per-department shift rotations.
