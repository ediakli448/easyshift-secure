-- EasyShift schema + RLS policies (Supabase)
-- IMPORTANT: Review policies before production. Keep them simple and scoped to org membership.

-- Enums
create type org_role as enum ('ADMIN', 'WORKER');
create type staff_role as enum ('VET', 'ASSISTANT');
create type schedule_status as enum ('DRAFT','LOCKED','PUBLISHED','ARCHIVED');
create type shift_label as enum ('MORNING','EVENING');
create type constraint_type as enum ('ALL_DAY','MORNING_ONLY','EVENING_ONLY','NONE');
create type preferred_shift as enum ('MORNING','EVENING','NONE');
create type assigned_by as enum ('AUTO','ADMIN');
create type swap_status as enum ('REQUESTED','OFFERED','ADMIN_APPROVAL','APPROVED','REJECTED','CANCELED');

-- Users profile (optional; auth.users exists)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Orgs
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by_user_id uuid not null references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Org members
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null,
  staff_role staff_role,
  joined_at timestamptz not null default now(),
  invited_by_user_id uuid,
  unique(org_id, user_id)
);

-- Org settings
create table if not exists public.org_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.orgs(id) on delete cascade,
  timezone text not null default 'Asia/Jerusalem',
  week_start text not null default 'Sunday',
  opening_hours jsonb not null,
  shift_change_time text not null default '15:00',
  default_requirements jsonb not null,
  submission_deadline timestamptz
);

-- Invites (single-use)
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Schedules
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  submission_deadline timestamptz,
  status schedule_status not null default 'DRAFT',
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- Shifts
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  date date not null,
  label shift_label not null,
  start_time text not null,
  end_time text not null,
  requirements jsonb not null default '{"VET":1,"ASSISTANT":2}'::jsonb
);

-- Constraints
create table if not exists public.constraints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type constraint_type not null default 'NONE',
  preferred preferred_shift not null default 'NONE',
  note text,
  unique(schedule_id, user_id, date)
);

-- Assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  role staff_role not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by assigned_by not null default 'ADMIN',
  reason text
);

-- Swaps
create table if not exists public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  status swap_status not null default 'REQUESTED',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.swap_offers (
  id uuid primary key default gen_random_uuid(),
  swap_request_id uuid not null references public.swap_requests(id) on delete cascade,
  offer_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(swap_request_id, offer_user_id)
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Audit log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helper: current user's orgs
create or replace function public.my_org_ids()
returns table(org_id uuid)
language sql
stable
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- RPC: memberships
create or replace function public.my_memberships()
returns table(org_id uuid, role org_role, staff_role staff_role, org_name text)
language sql
stable
as $$
  select m.org_id, m.role, m.staff_role, o.name
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  where m.user_id = auth.uid();
$$;

-- RPC: Admin dashboard stats (simple)
create or replace function public.admin_dashboard_stats(p_org_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  s record;
  total_members int;
  submitted_members int;
  unassigned int;
begin
  -- Ensure caller is admin in this org
  if not exists (select 1 from public.org_members where org_id = p_org_id and user_id = auth.uid() and role = 'ADMIN') then
    raise exception 'forbidden';
  end if;

  select * into s from public.schedules where org_id = p_org_id and status <> 'ARCHIVED' order by created_at desc limit 1;

  if s.id is null then
    return jsonb_build_object('schedule_status', 'NONE', 'constraints_completion_percent', 0, 'unassigned_slots', 0);
  end if;

  select count(*) into total_members from public.org_members where org_id = p_org_id and role = 'WORKER';
  select count(distinct user_id) into submitted_members from public.constraints where schedule_id = s.id;

  -- unassigned slots = sum requirements - count assignments
  select coalesce(sum((requirements->>'VET')::int + (requirements->>'ASSISTANT')::int),0) into unassigned from public.shifts where schedule_id = s.id;
  unassigned := unassigned - (select count(*) from public.assignments where schedule_id = s.id);

  return jsonb_build_object(
    'schedule_status', s.status,
    'constraints_completion_percent', case when total_members = 0 then 0 else round((submitted_members::numeric/total_members::numeric)*100)::int end,
    'unassigned_slots', greatest(unassigned,0)
  );
end;
$$;

-- RPC: My assignments for schedule (for swaps UI)
create or replace function public.my_assignments_for_schedule(p_schedule_id uuid)
returns table(assignment_id uuid, shift_id uuid, date date, label shift_label, role staff_role)
language sql
stable
as $$
  select a.id, a.shift_id, s.date, s.label, a.role
  from public.assignments a
  join public.shifts s on s.id = a.shift_id
  where a.schedule_id = p_schedule_id
    and a.user_id = auth.uid();
$$;

-- RPC: Stats (minimal JSON)
create or replace function public.my_stats_current_and_history(p_org_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  s record;
  total int;
  morning int;
  evening int;
begin
  if not exists (select 1 from public.org_members where org_id = p_org_id and user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into s from public.schedules where org_id = p_org_id and status = 'PUBLISHED' order by published_at desc limit 1;
  if s.id is null then
    return jsonb_build_object('current', jsonb_build_object('total', 0));
  end if;

  select count(*) into total from public.assignments where schedule_id = s.id and user_id = auth.uid();
  select count(*) into morning from public.assignments a join public.shifts sh on sh.id=a.shift_id where a.schedule_id = s.id and a.user_id = auth.uid() and sh.label='MORNING';
  select count(*) into evening from public.assignments a join public.shifts sh on sh.id=a.shift_id where a.schedule_id = s.id and a.user_id = auth.uid() and sh.label='EVENING';

  return jsonb_build_object(
    'current', jsonb_build_object('schedule_id', s.id, 'title', s.title, 'total', total, 'morning', morning, 'evening', evening)
  );
end;
$$;

-- RPC: Eligible candidates for shift slot (admin only)
create or replace function public.eligible_candidates_for_shift_slot(p_shift_id uuid, p_role staff_role)
returns table(
  user_id uuid,
  name text,
  email text,
  staff_role staff_role,
  current_count int,
  percent_within_role numeric,
  preferred preferred_shift,
  note text
)
language plpgsql
security invoker
as $$
declare
  org uuid;
  sched uuid;
  d date;
  lbl shift_label;
  total_role_shifts int;
begin
  select org_id, schedule_id, date, label into org, sched, d, lbl from public.shifts where id = p_shift_id;

  if org is null then
    raise exception 'shift not found';
  end if;

  if not exists (select 1 from public.org_members where org_id = org and user_id = auth.uid() and role = 'ADMIN') then
    raise exception 'forbidden';
  end if;

  -- total shifts assigned in this role for fairness denominator
  select count(*) into total_role_shifts
  from public.assignments a
  where a.schedule_id = sched and a.role = p_role;

  return query
  with members as (
    select m.user_id, u.name, u.email, m.staff_role
    from public.org_members m
    left join public.users u on u.id = m.user_id
    where m.org_id = org and m.role='WORKER' and m.staff_role = p_role
  ),
  blocked as (
    select c.user_id
    from public.constraints c
    where c.schedule_id = sched and c.date = d and (
      c.type = 'ALL_DAY' or
      (c.type = 'MORNING_ONLY' and lbl='MORNING') or
      (c.type = 'EVENING_ONLY' and lbl='EVENING')
    )
  ),
  pref as (
    select user_id, preferred, note
    from public.constraints
    where schedule_id = sched and date = d
  ),
  counts as (
    select user_id, count(*)::int as cnt
    from public.assignments
    where schedule_id = sched and role = p_role
    group by user_id
  )
  select
    m.user_id,
    coalesce(m.name, m.email) as name,
    m.email,
    m.staff_role,
    coalesce(ct.cnt,0) as current_count,
    case when total_role_shifts = 0 then 0 else (coalesce(ct.cnt,0)::numeric / greatest(total_role_shifts,1)::numeric)*100 end as percent_within_role,
    coalesce(p.preferred,'NONE') as preferred,
    p.note
  from members m
  left join counts ct on ct.user_id = m.user_id
  left join pref p on p.user_id = m.user_id
  where m.user_id not in (select user_id from blocked);
end;
$$;

-- Trigger: ensure constraints.user_id = auth.uid()
create or replace function public.set_constraint_user_id()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_constraints_user on public.constraints;
create trigger trg_constraints_user
before insert or update on public.constraints
for each row execute function public.set_constraint_user_id();

-- =========================
-- RLS
-- =========================
alter table public.users enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_settings enable row level security;
alter table public.org_invites enable row level security;
alter table public.schedules enable row level security;
alter table public.shifts enable row level security;
alter table public.constraints enable row level security;
alter table public.assignments enable row level security;
alter table public.swap_requests enable row level security;
alter table public.swap_offers enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- users: each user can read/update own row
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
for select using (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
for insert with check (id = auth.uid());

-- orgs: admin members can select their org; create handled by Edge Function, but allow insert only if created_by_user_id = auth.uid()
drop policy if exists "orgs_select_member" on public.orgs;
create policy "orgs_select_member" on public.orgs
for select using (id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "orgs_insert_creator" on public.orgs;
create policy "orgs_insert_creator" on public.orgs
for insert with check (created_by_user_id = auth.uid());

-- org_members: select only own membership; admins can read members in their org
drop policy if exists "org_members_select_own" on public.org_members;
create policy "org_members_select_own" on public.org_members
for select using (
  user_id = auth.uid()
  or org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN')
);

-- update staff_role: user can set own staff_role if null
drop policy if exists "org_members_update_own_staff_role" on public.org_members;
create policy "org_members_update_own_staff_role" on public.org_members
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- org_settings: members can read; only admins can update
drop policy if exists "org_settings_select_member" on public.org_settings;
create policy "org_settings_select_member" on public.org_settings
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "org_settings_update_admin" on public.org_settings;
create policy "org_settings_update_admin" on public.org_settings
for update using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'))
with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

drop policy if exists "org_settings_insert_admin" on public.org_settings;
create policy "org_settings_insert_admin" on public.org_settings
for insert with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

-- org_invites: admins only
drop policy if exists "org_invites_admin_all" on public.org_invites;
create policy "org_invites_admin_all" on public.org_invites
for all using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'))
with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

-- schedules/shifts/assignments: members can read; only admins can write (assignments may be via edge functions too)
drop policy if exists "schedules_select_member" on public.schedules;
create policy "schedules_select_member" on public.schedules
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "schedules_admin_write" on public.schedules;
create policy "schedules_admin_write" on public.schedules
for insert with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));
create policy "schedules_admin_update" on public.schedules
for update using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'))
with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

drop policy if exists "shifts_select_member" on public.shifts;
create policy "shifts_select_member" on public.shifts
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "shifts_admin_write" on public.shifts;
create policy "shifts_admin_write" on public.shifts
for insert with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));
create policy "shifts_admin_update" on public.shifts
for update using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'))
with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

-- constraints: member can read; worker can insert/update own rows; admin can read all
drop policy if exists "constraints_select_member" on public.constraints;
create policy "constraints_select_member" on public.constraints
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "constraints_write_own" on public.constraints;
create policy "constraints_write_own" on public.constraints
for insert with check (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
  and user_id = auth.uid()
);
create policy "constraints_update_own" on public.constraints
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- assignments: members can read; admins can write
drop policy if exists "assignments_select_member" on public.assignments;
create policy "assignments_select_member" on public.assignments
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "assignments_admin_write" on public.assignments;
create policy "assignments_admin_write" on public.assignments
for insert with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));
create policy "assignments_admin_update" on public.assignments
for update using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'))
with check (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));
create policy "assignments_admin_delete" on public.assignments
for delete using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));

-- swaps: members can read; requests/offers created via edge functions but allow select
drop policy if exists "swap_requests_select_member" on public.swap_requests;
create policy "swap_requests_select_member" on public.swap_requests
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

drop policy if exists "swap_offers_select_member" on public.swap_offers;
create policy "swap_offers_select_member" on public.swap_offers
for select using (
  swap_request_id in (select id from public.swap_requests where org_id in (select org_id from public.org_members where user_id = auth.uid()))
);

-- notifications: user can read own
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
for select using (user_id = auth.uid());

-- audit_log: admin can read
drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select" on public.audit_log
for select using (org_id in (select org_id from public.org_members where user_id = auth.uid() and role='ADMIN'));
