# Bookly — Room & Vehicle Booking System

> A full-stack web app that lets employees book meeting rooms, request company vehicles and join group trips — with approval workflows, a driver dispatch desk, meeting-room tablet displays and bilingual (Thai / English) UI.

🇹🇭 [อ่านเป็นภาษาไทย](README.th.md)

![Home calendar](docs/screenshots/02-home-calendar.jpg)

I designed and built this end to end — database, REST API, Vue front-end, background jobs and deployment — as an internal tool for a manufacturing company that was running room and car bookings through spreadsheets and chat messages. The screenshots below use **fictional demo data**.

## What it does

| Area | Highlights |
| --- | --- |
| **Meeting rooms** | Monthly availability calendar per room, weekly recurring bookings, conflict-free booking (double-booking is prevented by a locked, transactional overlap check), check-in with automatic release of no-shows, reminder emails. |
| **Vehicle requests** | Business-trip and OT-shuttle requests, multi-level approval with stored signatures, printable request form (PDF), document numbering (`VR-2026-0001`), dispatcher assigns driver & vehicle. |
| **Group trips** | Admins publish an event; employees register with their pick-up point and map link; boarding lists are exported to Excel and published per route. |
| **Fleet** | Drivers, vehicles, providers (on-demand / rental), shuttle routes with stops, driver schedule. |
| **Meeting-room tablet** | Token-authenticated wall display showing the room's schedule, with on-device check-in. |
| **Admin** | Users (local accounts + Active Directory import / login), departments, rooms, devices, usage reports with Excel export, full audit log. |
| **Quality of life** | In-app notification bell, email notifications, Thai/English UI switch, role-based access (Employee / Supervisor / Admin). |

## Screenshots

| | |
| --- | --- |
| ![Login](docs/screenshots/01-login.jpg) <br> **Login** — local or Active Directory accounts | ![Thai UI](docs/screenshots/03-home-thai.jpg) <br> **Bilingual UI** — one click switches Thai ⇄ English |
| ![Manage bookings](docs/screenshots/04-manage-room-bookings.jpg) <br> **Room bookings desk** — filter by range, status, room | ![Vehicle form](docs/screenshots/05-vehicle-request-form.jpg) <br> **Vehicle request** — guided form with travellers & approver |
| ![Dispatch](docs/screenshots/06-vehicle-requests-admin.jpg) <br> **Dispatch desk** — approval state, driver and vehicle assignment | ![Users](docs/screenshots/07-user-management.jpg) <br> **User management** — roles, approver levels, AD import |

## Tech stack

- **Front-end:** Vue 3 (Composition API), Vite, Pinia, Vue Router, vue-i18n, Tailwind CSS v4 — plain JavaScript, with a custom lightweight design system and lint scripts that enforce UI and i18n consistency.
- **Back-end:** Node.js (ES modules), Express 5, `mssql`, JWT in HTTP-only cookies, `ldapts` (Active Directory), Nodemailer, node-cron, ExcelJS.
- **Database:** Microsoft SQL Server — 45 incremental SQL migrations, history snapshots so old documents never change when someone moves department.
- **Testing & CI:** Vitest (350+ tests including concurrency / integration tests), ESLint, GitHub Actions.
- **Deployment:** IIS (static front-end + reverse proxy) with PM2 for the API.

## Engineering notes

- **Concurrency-safe bookings** — room and driver assignment are guarded by transactional locks and tested with parallel-request integration tests.
- **Audit trail & snapshots** — every state change is logged; requester / approver / driver details are snapshotted on each document.
- **Security** — least-privilege DB login, Helmet, rate-limited login, secrets only via `.env`, CI step that fails the build if a secret is tracked. See [`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md).
- **Documented** — requirements, architecture, UI style guide and interactive architecture/data-flow diagrams live in [`docs/`](docs/).

## Run it locally

Requires Node.js 20+ and SQL Server (Express is fine).

```bash
# 1. database + backend
cp backend/.env.example backend/.env      # fill in DB_* and JWT_SECRET (LDAP/SMTP optional)
cd backend && npm install
npm run migrate
node scripts/seed-demo.js                 # optional: fictional demo data
npm run dev                               # API on :3000

# 2. frontend (new terminal)
cd frontend && npm install && npm run dev # http://localhost:5173
```

Demo accounts (after `seed-demo.js`): `admin`, `supervisor`, `employee` — password `Demo@1234`.

Production deployment steps are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md); the user manual is in [`docs/USER-MANUAL.en.md`](docs/USER-MANUAL.en.md).

## Project structure

```
backend/    Express API — modules/ (auth, rooms, bookings, vehicle-requests, events, reports…), db/ migrations, tests/
frontend/   Vue 3 SPA — views/, components/, stores/, locales/ (th, en)
deploy/     IIS web.config, PM2 config, SQL Server setup script
docs/       requirements, architecture, diagrams, manual, screenshots
```

## License

Portfolio project — all rights reserved. Please don't reuse without permission.
