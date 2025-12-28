-- EasyShift Security Patch Migration
-- Addresses: P0.3 RLS policies, P1.1 Race conditions, P1.2 Unique constraints,
-- P1.3 Missing indexes, P1.4 Rate limiting, P1.8 Audit logging, notifications UPDATE

-- ============================================================================
-- P0.3: INSERT/UPDATE/DELETE RLS Policies for swap_requests and swap_offers
-- Block all direct writes - enforce Edge Function usage for audit trail
-- ============================================================================

-- swap_requests: Block direct INSERT (use Edge Functions)
drop policy if exists "swap_requests_insert_blocked" on public.swap_requests;
create policy "swap_requests_insert_blocked" on public.swap_requests
  for insert with check (false);

-- swap_requests: Block direct UPDATE (use Edge Functions)  
drop policy if exists "swap_requests_update_blocked" on public.swap_requests;
create policy "swap_requests_update_blocked" on public.swap_requests
  for update using (false) with check (false);

-- swap_requests: Block direct DELETE
drop policy if exists "swap_requests_delete_blocked" on public.swap_requests;
create policy "swap_requests_delete_blocked" on public.swap_requests
  for delete using (false);

-- swap_offers: Block direct INSERT (use Edge Functions)
drop policy if exists "swap_offers_insert_blocked" on public.swap_offers;
create policy "swap_offers_insert_blocked" on public.swap_offers
  for insert with check (false);

-- swap_offers: Block direct UPDATE
drop policy if exists "swap_offers_update_blocked" on public.swap_offers;
create policy "swap_offers_update_blocked" on public.swap_offers
  for update using (false) with check (false);

-- swap_offers: Block direct DELETE
drop policy if exists "swap_offers_delete_blocked" on public.swap_offers;
create policy "swap_offers_delete_blocked" on public.swap_offers
  for delete using (false);

-- ============================================================================
-- FIX: notifications UPDATE policy (allow users to mark as read)
-- ============================================================================

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_read = true);

-- ============================================================================
-- P1.2: Unique constraint on assignments (prevent duplicates)
-- ============================================================================

create unique index if not exists idx_assignments_unique
  on public.assignments (schedule_id, shift_id, role, user_id);

-- ============================================================================
-- P1.3: Missing indexes on Foreign Keys and commonly queried columns
-- ============================================================================

-- org_members indexes
create index if not exists idx_org_members_org_id on public.org_members(org_id);
create index if not exists idx_org_members_user_id on public.org_members(user_id);

-- org_invites indexes
create index if not exists idx_org_invites_token on public.org_invites(token);
create index if not exists idx_org_invites_org_id on public.org_invites(org_id);

-- schedules indexes
create index if not exists idx_schedules_org_id_status on public.schedules(org_id, status);
create index if not exists idx_schedules_created_at on public.schedules(created_at desc);

-- shifts indexes
create index if not exists idx_shifts_schedule_id on public.shifts(schedule_id);
create index if not exists idx_shifts_date on public.shifts(date);

-- constraints indexes
create index if not exists idx_constraints_schedule_user_date on public.constraints(schedule_id, user_id, date);

-- assignments indexes
create index if not exists idx_assignments_schedule_id on public.assignments(schedule_id);
create index if not exists idx_assignments_user_id on public.assignments(user_id);
create index if not exists idx_assignments_shift_id on public.assignments(shift_id);

-- swap_requests indexes
create index if not exists idx_swap_requests_org_status on public.swap_requests(org_id, status);
create index if not exists idx_swap_requests_requester on public.swap_requests(requester_user_id);

-- swap_offers indexes
create index if not exists idx_swap_offers_swap_request on public.swap_offers(swap_request_id);

-- notifications indexes
create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read, created_at desc);

-- audit_log indexes
create index if not exists idx_audit_log_org_created on public.audit_log(org_id, created_at desc);

-- ============================================================================
-- P1.4: Rate limiting table
-- ============================================================================

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 1,
  window_start bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

-- RPC: Increment rate limit counter atomically
create or replace function public.increment_rate_limit(
  p_key text,
  p_window_start bigint,
  p_ttl int
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, p_window_start)
  on conflict (key)
  do update set 
    count = case 
      when rate_limits.window_start < p_window_start - p_ttl then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < p_window_start - p_ttl then p_window_start
      else rate_limits.window_start
    end;
    
  -- Cleanup old entries periodically
  delete from public.rate_limits 
  where window_start < extract(epoch from now())::bigint - (p_ttl * 2);
end;
$$;

-- RPC: Check rate limit (returns count for key within window)
create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds int
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
  v_window_start bigint;
begin
  v_window_start := extract(epoch from now())::bigint - p_window_seconds;
  
  select count into v_count
  from public.rate_limits
  where key = p_key and window_start >= v_window_start;
  
  return coalesce(v_count, 0);
end;
$$;

-- ============================================================================
-- P1.1: Atomic swap approval RPC (prevents race conditions)
-- ============================================================================

create or replace function public.approve_swap_atomic(
  p_swap_request_id uuid,
  p_offer_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_swap record;
  v_offer record;
  v_assignment record;
  v_org_id uuid;
  v_role staff_role;
begin
  -- Lock swap_request row for update (prevents concurrent approvals)
  select * into v_swap
  from public.swap_requests
  where id = p_swap_request_id
  for update;

  if v_swap.id is null then
    return jsonb_build_object('error', 'swap_not_found');
  end if;

  -- Check if already resolved
  if v_swap.status in ('APPROVED', 'REJECTED', 'CANCELED') then
    return jsonb_build_object('error', 'already_resolved');
  end if;

  -- Verify admin role in org
  if not exists (
    select 1 from public.org_members
    where org_id = v_swap.org_id
      and user_id = p_admin_user_id
      and role = 'ADMIN'
  ) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- Verify offer exists and belongs to this swap
  select * into v_offer
  from public.swap_offers
  where id = p_offer_id and swap_request_id = p_swap_request_id;

  if v_offer.id is null then
    return jsonb_build_object('error', 'offer_not_found');
  end if;

  -- Get requester's staff role
  select staff_role into v_role
  from public.org_members
  where org_id = v_swap.org_id and user_id = v_swap.requester_user_id;

  if v_role is null then
    return jsonb_build_object('error', 'requester_role_not_found');
  end if;

  -- Find and lock requester's assignment
  select * into v_assignment
  from public.assignments
  where shift_id = v_swap.shift_id
    and user_id = v_swap.requester_user_id
    and role = v_role
  for update;

  if v_assignment.id is null then
    return jsonb_build_object('error', 'assignment_not_found');
  end if;

  -- Swap assignment to offer user
  update public.assignments
  set user_id = v_offer.offer_user_id,
      assigned_by = 'ADMIN',
      reason = 'Swap approved'
  where id = v_assignment.id;

  -- Mark swap as approved
  update public.swap_requests
  set status = 'APPROVED',
      resolved_at = now()
  where id = p_swap_request_id;

  -- Create notifications for both parties
  insert into public.notifications (org_id, user_id, type, payload)
  values
    (v_swap.org_id, v_swap.requester_user_id, 'SWAP_APPROVED', 
     jsonb_build_object('swapRequestId', p_swap_request_id)),
    (v_swap.org_id, v_offer.offer_user_id, 'SWAP_APPROVED', 
     jsonb_build_object('swapRequestId', p_swap_request_id));

  -- Log audit entry
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, diff)
  values (
    v_swap.org_id,
    p_admin_user_id,
    'SWAP_APPROVED',
    'swap_request',
    p_swap_request_id,
    jsonb_build_object(
      'offerId', p_offer_id,
      'requesterUserId', v_swap.requester_user_id,
      'offerUserId', v_offer.offer_user_id,
      'shiftId', v_swap.shift_id
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- P1.5: Cleanup expired invites function
-- ============================================================================

create or replace function public.cleanup_expired_invites()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.org_invites
  where expires_at < now() - interval '30 days'
     or (used_at is not null and used_at < now() - interval '90 days');
end;
$$;

-- ============================================================================
-- P1.8: Audit logging helper function
-- ============================================================================

create or replace function public.log_audit(
  p_org_id uuid,
  p_user_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_diff jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (org_id, user_id, action, entity, entity_id, diff)
  values (p_org_id, p_user_id, p_action, p_entity, p_entity_id, p_diff);
end;
$$;
