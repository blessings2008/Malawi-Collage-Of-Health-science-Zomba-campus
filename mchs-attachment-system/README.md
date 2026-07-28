# Clinical Attachment Allocation System

**Malawi College of Health Sciences — Zomba Campus**
Designed & Developed by Tambala Technologies

A full-stack platform for managing student clinical attachment allocations
across districts, cohorts, and attachment periods — with an intelligent,
history-aware allocation engine at its core.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router
- **Backend:** Node.js + Express
- **Database & Auth:** Supabase (Postgres + Auth)
- **Hosting:** Render (two services — client + server)

## Project Structure

```
mchs-attachment-system/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── pages/          # One file per screen
│       ├── components/ui.jsx
│       ├── layouts/AppLayout.jsx
│       ├── context/AuthContext.jsx
│       └── lib/            # Supabase client + API wrapper
├── server/                 # Express API
│   ├── routes/             # One file per resource
│   ├── services/           # Allocation engine, audit log, notifications
│   ├── middleware/auth.js  # JWT verification + role gating
│   └── lib/supabase.js     # Service-role Supabase client
├── supabase/migrations/    # SQL schema + RLS policies
└── render.yaml              # Render deployment blueprint
```

## 1. Set up Supabase

1. Create a new project at https://supabase.com.
2. In the SQL Editor, run the migrations in order:
   - `supabase/migrations/0001_core_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
3. Create your first Super Administrator:
   - In **Authentication → Users**, click "Add user" and create an account
     (email + password, confirm email automatically).
   - In the SQL editor, insert their profile row:
     ```sql
     insert into public.profiles (id, full_name, email, role)
     values ('<the user id from Authentication>', 'Your Name', 'you@mchs.ac.mw', 'super_admin');
     ```
   - After that, use the in-app **User Management** page to create further
     admin and lecturer accounts — no more manual SQL needed.
4. Grab your project's **URL**, **anon public key**, and **service_role key**
   from Project Settings → API. You'll need these for both `.env` files below.

## 2. Run locally

**Server:**
```bash
cd server
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
npm install
npm run dev             # http://localhost:8080
```

**Client:**
```bash
cd client
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL=http://localhost:8080
npm install
npm run dev              # http://localhost:5173
```

## 3. Deploy to Render

This repo includes `render.yaml`, so you can use Render's **Blueprint**
deploy: push this repo to GitHub, then in Render choose
"New → Blueprint" and point it at the repo. It will create both services
(`mchs-attachment-server` and `mchs-attachment-client`) automatically.

After the blueprint runs, set the env vars flagged `sync: false` in the
Render dashboard for each service (Supabase credentials, and the client's
`VITE_API_BASE_URL` pointing at your deployed server's URL, and the
server's `CLIENT_ORIGIN` pointing at your deployed client's URL — this
keeps CORS locked down to your actual frontend).

Alternatively, create the two services manually in the Render dashboard
using the same root directories, build commands, and start commands shown
in `render.yaml`.

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
