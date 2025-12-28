# EasyShift (Lovable.dev-compatible)

This repository is a **reviewable codebase** for the EasyShift app described in our chat:
- React + Vite + Tailwind frontend (matches Lovable's default stack).  
- Supabase as backend (Auth + Postgres + RLS + Edge Functions).  

## Why this architecture
Lovable projects connected to Supabase rely heavily on **Row Level Security (RLS)** and server-side logic for privileged actions.
Keep **service_role** out of the client; use Edge Functions for complex/privileged flows.

## Contents
- `src/` React app
- `supabase/migrations/001_init.sql` schema + RLS policies + helper RPCs
- `supabase/functions/*` Edge Functions called from the frontend

## Run locally
1) Create a Supabase project and apply the migration SQL:
   - Copy `supabase/migrations/001_init.sql` into your Supabase SQL editor and run it.
2) Deploy Edge Functions (names must match folder names):
   - `create_org`, `create_invite`, `revoke_invite`, `accept_invite`, `upsert_constraints`,
     `assign_manual`, `auto_schedule`, `lock_submissions`, `publish_schedule`,
     `request_swap`, `offer_swap`, `approve_swap`, `reject_swap`.
3) Configure `.env`:
   - Copy `.env.example` to `.env`
   - Put your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4) Install & start:
   - `npm i`
   - `npm run dev`

## Security notes (review checklist)
- RLS enabled on all tables; policies enforce `org_id` membership.
- Edge Functions derive user from JWT and verify admin membership for privileged ops.
- Never trust client-provided `org_id`/`user_id`.
- Constraints `user_id` is enforced via trigger to prevent IDOR-style writes.

## Known MVP limitations (intentional for review)
- Schedule creation UI is stubbed (Create Org is implemented; schedule generation can be added).
- Candidate list uses a server RPC for eligibility checks (good pattern), but you may want richer UI display names.
- Auto-schedule algorithm is a baseline heuristic; can be upgraded to backtracking/ILP later.
.
