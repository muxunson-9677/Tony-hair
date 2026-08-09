create extension if not exists pgcrypto;

create table if not exists share_assets (
  id uuid primary key default gen_random_uuid(),
  upload_id text not null,
  session_hash char(64) not null,
  pathname text not null unique,
  blob_url text,
  content_type text not null check (content_type in ('image/jpeg', 'image/webp')),
  content_hash char(64) not null check (content_hash ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 1 and 1500000),
  state text not null check (state in ('reserved', 'ready', 'attached', 'delete_pending')),
  poll_id text,
  reserved_at timestamptz not null,
  ready_at timestamptz,
  delete_started_at timestamptz,
  cleanup_claimed_at timestamptz
);

create table if not exists polls (
  id text primary key,
  session_hash char(64) not null,
  client_request_id text not null,
  title text not null check (char_length(title) between 1 and 60),
  management_token_hash char(64) not null,
  status text not null check (status in ('active', 'delete_pending')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  unique (session_hash, client_request_id),
  unique (id, session_hash)
);

alter table share_assets
  drop constraint if exists share_assets_poll_id_fkey;
alter table share_assets
  add constraint share_assets_poll_id_fkey foreign key (poll_id) references polls (id);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null references polls (id) on delete cascade,
  asset_id uuid not null unique references share_assets (id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 4),
  label text not null check (char_length(label) between 1 and 40),
  disclosure text not null check (disclosure in ('demo', 'reference')),
  unique (poll_id, ordinal),
  unique (poll_id, id)
);

create table if not exists poll_votes (
  id bigint generated always as identity primary key,
  poll_id text not null references polls (id) on delete cascade,
  option_id uuid,
  voter_cookie_hash char(64) not null,
  comment text not null default '' check (char_length(comment) <= 60),
  created_at timestamptz not null,
  unique (poll_id, voter_cookie_hash),
  foreign key (poll_id, option_id) references poll_options (poll_id, id) on delete cascade
);

create table if not exists poll_tombstones (
  poll_id text primary key,
  reason text not null check (reason in ('revoked', 'expired')),
  deleted_at timestamptz not null,
  purge_after timestamptz not null
);

create index if not exists share_assets_session_state_idx on share_assets (session_hash, state);
create unique index if not exists share_assets_session_upload_idx on share_assets (session_hash, upload_id);
create index if not exists share_assets_cleanup_idx on share_assets (state, cleanup_claimed_at);
create index if not exists polls_expiry_idx on polls (status, expires_at);
create index if not exists poll_tombstones_purge_idx on poll_tombstones (purge_after);

create or replace function reserve_share_asset(
  p_session_hash char(64),
  p_upload_id text,
  p_pathname text,
  p_bytes integer,
  p_content_type text,
  p_content_hash char(64),
  p_now timestamptz
) returns table(
  outcome text,
  returned_asset_id uuid,
  returned_pathname text,
  returned_blob_url text
)
language plpgsql
as $$
declare
  v_total bigint;
  v_pending integer;
  v_existing share_assets%rowtype;
  v_asset_id uuid;
begin
  perform pg_advisory_xact_lock(902101);

  select * into v_existing from share_assets
  where session_hash = p_session_hash and upload_id = p_upload_id
  for update;
  if found then
    if v_existing.bytes <> p_bytes
       or v_existing.content_type <> p_content_type
       or v_existing.content_hash <> p_content_hash then
      return query select 'conflict', null::uuid, null::text, null::text;
    elsif v_existing.state = 'ready' then
      return query select 'ready', v_existing.id, v_existing.pathname, v_existing.blob_url;
    elsif v_existing.state = 'reserved' then
      return query select 'reserved_replay', v_existing.id, v_existing.pathname, null::text;
    elsif v_existing.state = 'attached' then
      return query select 'attached', v_existing.id, v_existing.pathname, v_existing.blob_url;
    else
      return query select 'conflict', null::uuid, null::text, null::text;
    end if;
    return;
  end if;

  select count(*) into v_pending
  from share_assets
  where session_hash = p_session_hash and state in ('reserved', 'ready');
  if v_pending >= 8 then
    return query select 'pending_limit', null::uuid, null::text, null::text;
    return;
  end if;

  select coalesce(sum(bytes), 0) into v_total
  from share_assets
  where state in ('reserved', 'ready', 'attached', 'delete_pending');
  if v_total + p_bytes > 800 * 1024 * 1024 then
    return query select 'global_limit', null::uuid, null::text, null::text;
    return;
  end if;

  insert into share_assets(upload_id, session_hash, pathname, content_type, content_hash, bytes, state, reserved_at)
  values (p_upload_id, p_session_hash, p_pathname, p_content_type, p_content_hash, p_bytes, 'reserved', p_now)
  returning id into v_asset_id;
  return query select 'reserved', v_asset_id, p_pathname, null::text;
exception when unique_violation then
  return query select 'conflict', null::uuid, null::text, null::text;
end;
$$;

create or replace function mark_share_asset_ready(
  p_upload_id text,
  p_session_hash char(64),
  p_blob_url text,
  p_now timestamptz
) returns boolean
language sql
as $$
  update share_assets
  set state = 'ready', blob_url = p_blob_url, ready_at = p_now
  where upload_id = p_upload_id and session_hash = p_session_hash and state in ('reserved', 'ready')
  returning true;
$$;

create or replace function create_share_poll(
  p_poll_id text,
  p_session_hash char(64),
  p_client_request_id text,
  p_management_token_hash char(64),
  p_title text,
  p_asset_ids uuid[],
  p_labels text[],
  p_disclosures text[],
  p_now timestamptz
) returns table(outcome text, returned_poll_id text, returned_expires_at timestamptz, returned_management_hash char(64))
language plpgsql
as $$
declare
  v_existing polls%rowtype;
  v_expires_at timestamptz := p_now + interval '7 days';
  v_ready_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('poll-session:' || p_session_hash, 0));

  select * into v_existing from polls
  where session_hash = p_session_hash and client_request_id = p_client_request_id;
  if found then
    return query select 'idempotent_candidate', v_existing.id, v_existing.expires_at, v_existing.management_token_hash;
    return;
  end if;

  if cardinality(p_asset_ids) < 2 or cardinality(p_asset_ids) > 4
     or cardinality(p_labels) <> cardinality(p_asset_ids)
     or cardinality(p_disclosures) <> cardinality(p_asset_ids)
     or exists(select 1 from unnest(p_disclosures) disclosure where disclosure not in ('demo', 'reference'))
     or (select count(distinct item) from unnest(p_asset_ids) item) <> cardinality(p_asset_ids) then
    return query select 'invalid_assets', null::text, null::timestamptz, null::char(64);
    return;
  end if;

  if (select count(*) from polls where session_hash = p_session_hash and status = 'active' and expires_at > p_now) >= 10 then
    return query select 'active_limit', null::text, null::timestamptz, null::char(64);
    return;
  end if;

  perform 1
  from share_assets
  where session_hash = p_session_hash and state = 'ready' and id = any(p_asset_ids)
  for update;
  select count(*) into v_ready_count
  from share_assets
  where session_hash = p_session_hash and state = 'ready' and id = any(p_asset_ids);
  if v_ready_count <> cardinality(p_asset_ids) then
    return query select 'invalid_assets', null::text, null::timestamptz, null::char(64);
    return;
  end if;

  insert into polls(id, session_hash, client_request_id, title, management_token_hash, status, created_at, expires_at)
  values (p_poll_id, p_session_hash, p_client_request_id, p_title, p_management_token_hash, 'active', p_now, v_expires_at);

  insert into poll_options(poll_id, asset_id, ordinal, label, disclosure)
  select p_poll_id, a.id, u.ordinality::smallint, p_labels[u.ordinality], p_disclosures[u.ordinality]
  from unnest(p_asset_ids) with ordinality as u(asset_id, ordinality)
  join share_assets a on a.id = u.asset_id and a.session_hash = p_session_hash;

  update share_assets set state = 'attached', poll_id = p_poll_id
  where session_hash = p_session_hash and id = any(p_asset_ids);

  return query select 'created', p_poll_id, v_expires_at, null::char(64);
end;
$$;

create or replace function cast_share_vote(
  p_poll_id text,
  p_option_id uuid,
  p_voter_cookie_hash char(64),
  p_comment text,
  p_now timestamptz
) returns text
language plpgsql
as $$
declare
  v_status text;
  v_expires_at timestamptz;
begin
  if exists(select 1 from poll_tombstones where poll_id = p_poll_id) then return 'gone'; end if;
  select status, expires_at into v_status, v_expires_at
  from polls where id = p_poll_id for share;
  if not found then return 'not_found'; end if;
  if v_status <> 'active' or v_expires_at <= p_now then return 'gone'; end if;
  if p_option_id is not null and not exists(
    select 1 from poll_options where poll_id = p_poll_id and id = p_option_id
  ) then return 'invalid_option'; end if;

  insert into poll_votes(poll_id, option_id, voter_cookie_hash, comment, created_at)
  values (p_poll_id, p_option_id, p_voter_cookie_hash, p_comment, p_now);
  return 'created';
exception when unique_violation then
  return 'duplicate';
end;
$$;

create or replace function begin_poll_deletion(
  p_poll_id text,
  p_management_token_hash char(64),
  p_reason text,
  p_now timestamptz
) returns table(outcome text, pathname text)
language plpgsql
as $$
declare
  v_poll polls%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_poll_id, 0));
  select * into v_poll from polls where id = p_poll_id for update;
  if not found then
    if exists(select 1 from poll_tombstones where poll_id = p_poll_id) then
      return query select 'gone', null::text;
    else
      return query select 'not_found', null::text;
    end if;
    return;
  end if;
  if v_poll.management_token_hash <> p_management_token_hash then
    return query select 'forbidden', null::text; return;
  end if;

  if v_poll.status = 'delete_pending' then
    return query
    select 'delete_pending', a.pathname from share_assets a where a.poll_id = p_poll_id
    union all
    select 'delete_pending', null::text where not exists(select 1 from share_assets a where a.poll_id = p_poll_id);
    return;
  end if;

  insert into poll_tombstones(poll_id, reason, deleted_at, purge_after)
  values (p_poll_id, p_reason, p_now, p_now + interval '30 days')
  on conflict (poll_id) do nothing;
  update polls set status = 'delete_pending' where id = p_poll_id;
  update share_assets
  set state = 'delete_pending', delete_started_at = coalesce(delete_started_at, p_now), cleanup_claimed_at = null
  where poll_id = p_poll_id;

  return query
  select 'delete_pending', a.pathname from share_assets a where a.poll_id = p_poll_id
  union all
  select 'delete_pending', null::text where not exists(select 1 from share_assets a where a.poll_id = p_poll_id);
end;
$$;

create or replace function claim_poll_cleanup(
  p_now timestamptz,
  p_batch integer
) returns table(pathname text)
language plpgsql
as $$
declare
  v_expired_ids text[] := array[]::text[];
begin
  delete from poll_tombstones
  where poll_id in (
    select poll_id from poll_tombstones where purge_after <= p_now
    order by purge_after limit greatest(1, least(p_batch, 100))
  );

  select coalesce(array_agg(id), array[]::text[]) into v_expired_ids
  from (
    select id from polls
    where status = 'active' and expires_at <= p_now
    order by expires_at
    limit greatest(1, least(p_batch, 100))
    for update skip locked
  ) expired;

  insert into poll_tombstones(poll_id, reason, deleted_at, purge_after)
  select unnest(v_expired_ids), 'expired', p_now, p_now + interval '30 days'
  on conflict (poll_id) do nothing;

  update polls p set status = 'delete_pending'
  where p.id = any(v_expired_ids);
  update share_assets a
  set state = 'delete_pending', delete_started_at = coalesce(delete_started_at, p_now), cleanup_claimed_at = null
  where a.poll_id = any(v_expired_ids) and a.state <> 'delete_pending';

  with stale as (
    select id from share_assets
    where (state = 'reserved' and reserved_at <= p_now - interval '15 minutes')
       or (state = 'ready' and ready_at <= p_now - interval '1 day')
    order by reserved_at
    limit greatest(1, least(p_batch, 100))
    for update skip locked
  )
  update share_assets a
  set state = 'delete_pending', delete_started_at = coalesce(delete_started_at, p_now), cleanup_claimed_at = null
  from stale where a.id = stale.id;

  return query
  with candidates as (
    select a.id
    from share_assets a
    where a.state = 'delete_pending'
      and (a.cleanup_claimed_at is null or a.cleanup_claimed_at <= p_now - interval '5 minutes')
    order by a.delete_started_at nulls first, a.id
    for update skip locked
    limit greatest(1, least(p_batch, 100))
  ), claimed as (
    update share_assets a set cleanup_claimed_at = p_now
    from candidates c where a.id = c.id
    returning a.pathname
  )
  select claimed.pathname from claimed;
end;
$$;

create or replace function finalize_poll_cleanup(p_pathnames text[])
returns void
language plpgsql
as $$
begin
  delete from share_assets where state = 'delete_pending' and pathname = any(p_pathnames);
  delete from polls p
  where p.status = 'delete_pending'
    and not exists(select 1 from share_assets a where a.poll_id = p.id);
end;
$$;
