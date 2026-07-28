# Clinical Attachment Allocation System

**Malawi College of Health Sciences — Zomba Campus**
Designed & Developed by Tambala Technologies

A full-stack platform for managing student clinical attachment allocations
across districts, cohorts, and attachment periods — with an intelligent,
history-aware allocation engine at its core.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router
- **Backend:** Node.js + Express — also serves the built frontend as static files
- **Database & Auth:** Supabase (Postgres + Auth)
- **Hosting:** Render — **one single web service** (not two)

The client and server deploy together as one Render service: Express
serves the API under `/api/*` and serves the built React app for every
other route. This avoids CORS entirely (everything is same-origin) and
is simpler to operate than running two separate services.

## Project Structure

```
mchs-attachment-system/
├── package.json             # Root orchestrator: builds client + starts server
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # One file per screen
│       ├── components/ui.jsx
│       ├── layouts/AppLayout.jsx
│       ├── context/AuthContext.jsx
│       └── lib/             # Supabase client + API wrapper
├── server/                  # Express API + static file server
│   ├── index.js             # Serves /api/* AND client/dist/* (after build)
│   ├── routes/               # One file per resource
│   ├── services/             # Allocation engine, audit log, notifications
│   ├── middleware/auth.js    # JWT verification + role gating
│   └── lib/supabase.js       # Service-role Supabase client
├── supabase/migrations/      # SQL schema + RLS policies
└── render.yaml                # Render deployment blueprint (single service)
```

## 1. Set up Supabase first

1. Create a new project at https://supabase.com.
2. In the SQL Editor, run the migrations **in order** — open each file,
   copy its full contents, paste into a new query, and run it:
   - `supabase/migrations/0001_core_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
3. Create your first Super Administrator:
   - **Authentication → Users → Add user** — create an account with
     email + password, with "Auto confirm user" checked.
   - Copy that user's ID, then in the SQL Editor run:
     ```sql
     insert into public.profiles (id, full_name, email, role)
     values ('<the user id from Authentication>', 'Your Name', 'you@mchs.ac.mw', 'super_admin');
     ```
   - After that, use the in-app **User Management** page to create
     further admin/lecturer accounts — no more manual SQL needed.
4. Grab your project's **URL**, **anon public key**, and **service_role
   key** from Project Settings → API. You'll need all three below.

## 2. Run locally

Local dev still runs client and server as two separate dev servers
(hot reload needs this), even though production is one combined service.

**Server:**
```bash
cd server
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
npm install
npm run dev             # http://localhost:8080
```

**Client** (in a second terminal):
```bash
cd client
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173, proxies API calls to localhost:8080
```

## 3. Deploy to Render — single service

1. Push this repo to GitHub (use `git`, not GitHub's one-by-one file
   upload — that will scramble the folder structure).
2. In Render: **New → Blueprint**, point it at the repo. It reads
   `render.yaml` and creates **one** web service:
   `mchs-attachment-system`, with:
   - **Build Command:** `npm run build` (installs both client + server,
     then builds the client into `client/dist`)
   - **Start Command:** `npm start` (runs the Express server, which
     serves both the API and the built client)
3. After it's created, set these environment variables in the Render
   dashboard (they're left blank on purpose by the blueprint):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_URL` (same value as `SUPABASE_URL`)
   - `VITE_SUPABASE_ANON_KEY` (same value as `SUPABASE_ANON_KEY`)
4. Trigger a deploy (or it will deploy automatically after you save the
   env vars). Visit the one URL Render gives you — that's your whole
   app, frontend and backend both.

No `CLIENT_ORIGIN` or `VITE_API_BASE_URL` needed — same origin means no
CORS configuration is required at all.

### If you deployed the old two-service version previously

You can delete the second (client) Render service — it's no longer
needed. Keep only the one service pointed at the repo root with the
build/start commands above.

## Roles

- **Super Administrator** — full access, including user management and
  unlocking finalized allocations.
- **Administrator** — manages students, cohorts, districts, periods,
  allocations, and reports.
- **Lecturer** — read-only: view students/allocations, search, filter,
  export reports.

## The Allocation Engine

The core logic lives in `server/services/allocationEngine.js` — a pure
function with no database dependency, so it's easy to test or tune in
isolation. It implements:

- **Avoid District Repetition** — prefers districts a student hasn't
  visited, using their full cross-period history.
- **Balance District Capacity** — never exceeds a district's configured
  capacity.
- **Balance Gender** — spreads male/female students evenly within each
  district as it fills.
- **Prevent Duplicate Allocation** — structurally guaranteed: one result
  per student per run.
- **Forced repeats** — if a student has visited every available district,
  the engine picks the best remaining option and records why
  (`rotationReason`), so admins always see the reasoning.

`server/routes/allocations.js` wires this into the review → manual
adjustment → finalize/lock workflow described in the product spec.
