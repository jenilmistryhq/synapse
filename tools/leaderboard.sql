-- PROJECT SYNAPSE - global leaderboard for Supabase (free tier is plenty).
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is safe to run again. Then put the project URL and anon key into app/config.js.
--
-- Security model: the anon key is public, so anyone can call this API
-- directly. The public may READ scores and ADD scores, nothing else. Every
-- column is range-checked, names pass a swear filter, created_at is set by
-- the server, and each network is rate limited.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  case_id     text        not null check (case_id ~ '^[A-Z0-9-]{3,32}$'),
  name        text        not null check (char_length(name) between 2 and 20
                                          and name ~ '^[A-Za-z0-9 _.-]+$'
                                          and name ~ '[A-Za-z]'),
  score       integer     not null check (score between -100 and 250),
  time_ms     bigint      not null check (time_ms between 60000 and 86400000),
  band        text        not null check (char_length(band) <= 40 and band ~ '^[A-Za-z0-9 ,.''-]*$'),
  correct     boolean     not null,
  accusations smallint    not null check (accusations between 1 and 3),
  authorities smallint    not null check (authorities between 0 and 20),
  created_at  timestamptz not null default now()
);

create index if not exists scores_rank on public.scores (case_id, score desc, time_ms asc);

-- The device key that owns the name (see section 6). Written on insert, never readable.
alter table public.scores add column if not exists owner text;
alter table public.scores drop constraint if exists scores_owner_format;
alter table public.scores add constraint scores_owner_format check (owner is null or owner ~ '^[a-f0-9]{32}$');

-- 1. Privileges: Supabase grants broad rights to the API roles by default.
--    Take them all back, then give exactly what the game needs. Inserting is
--    limited to the game's columns, so nobody can choose id or created_at.
revoke all on public.scores from public, anon, authenticated;
grant select (id, case_id, name, score, time_ms, band, correct, accusations, authorities, created_at)
  on public.scores to anon, authenticated;
grant insert (case_id, name, score, time_ms, band, correct, accusations, authorities, owner)
  on public.scores to anon, authenticated;

-- 2. Row-level security: read everything, add rows, never edit or delete.
alter table public.scores enable row level security;
drop policy if exists "scores are public" on public.scores;
drop policy if exists "anyone can post a score" on public.scores;
create policy "scores are public" on public.scores for select using (true);
create policy "anyone can post a score" on public.scores for insert with check (true);

-- 3. Name filter (backstop for app/js/profanity.js, which runs first).
create or replace function public.scores_name_is_clean(n text) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
declare
  norm   text := lower(translate(n, '0134578@$!', 'oieastbasi'));
  joined text := replace(regexp_replace(norm, '[^a-z]', '', 'g'), 'scunthorpe', '');
  anywhere text[] := array['fuck','fuk','cunt','bitch','whore','slut','nigger','nigga','faggot',
    'retard','bastard','asshole','arsehole','dickhead','motherf','wanker','twat','pussy','bollock',
    'bullshit','shithead','porn','rapist','nazi','hitler','chutiya','chutia','madarchod','behenchod',
    'bhenchod','benchod','bhosdi','bhosad','harami','gandu','lavde','lawde','laude'];
  whole text[] := array['ass','arse','dick','cock','cum','tit','tits','fag','sex','anal','piss','shit',
    'crap','damn','rape','kkk','wtf','stfu','mc','bc','bsdk','lund','loda','lodu','lauda','kutta',
    'kutti','kamina','chod','gaand','saala','saali'];
  w text;
begin
  foreach w in array anywhere loop
    if position(w in joined) > 0 then return false; end if;
  end loop;
  foreach w in array whole loop
    if norm ~ ('(^|[^a-z])' || w || '([^a-z]|$)') then return false; end if;
  end loop;
  return true;
end $$;

alter table public.scores drop constraint if exists scores_name_clean;
alter table public.scores add constraint scores_name_clean check (public.scores_name_is_clean(name));

-- 4. Rate limit: at most 10 scores per network per hour, and a global brake
--    of 300 per 10 minutes against floods from rotating addresses. Only a
--    salted hash of the address is kept, for one day, in a table the API
--    cannot see.
create table if not exists public.score_rate (
  ip_hash text        not null,
  at      timestamptz not null default now()
);
create index if not exists score_rate_ip on public.score_rate (ip_hash, at);
alter table public.score_rate enable row level security;
revoke all on public.score_rate from public, anon, authenticated;

create or replace function public.scores_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  hdrs json := nullif(current_setting('request.headers', true), '')::json;
  -- Prefer headers set by Supabase's edge (clients cannot forge them). The
  -- first X-Forwarded-For entry is client-supplied, so only its last is used.
  ip   text := coalesce(
            nullif(hdrs ->> 'cf-connecting-ip', ''),
            nullif(hdrs ->> 'x-real-ip', ''),
            nullif(trim(reverse(split_part(reverse(coalesce(hdrs ->> 'x-forwarded-for', '')), ',', 1))), ''),
            'unknown');
  h    text := md5('synapse-rate:' || trim(ip));
begin
  new.created_at := now();
  delete from score_rate where at < now() - interval '1 day';
  if (select count(*) from score_rate where ip_hash = h and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many scores posted from this network' using errcode = 'P0001';
  end if;
  if (select count(*) from score_rate where at > now() - interval '10 minutes') >= 300 then
    raise exception 'Too many scores posted right now' using errcode = 'P0001';
  end if;
  insert into score_rate (ip_hash) values (h);
  return new;
end $$;

revoke all on function public.scores_before_insert() from public, anon, authenticated;
drop trigger if exists scores_before_insert on public.scores;
create trigger scores_before_insert before insert on public.scores
  for each row execute function public.scores_before_insert();

-- 5. Rankings. A detective is a name, case-insensitive. On each case their best
--    run counts (highest score, then fastest). Overall, their best runs on every
--    case are added up. Both views are read-only and run with the reader's own
--    rights (security_invoker), so they show nothing the scores table does not.
create or replace view public.case_ranks with (security_invoker = on) as
with best as (
  select distinct on (case_id, lower(name))
    case_id, name, lower(name) as lname, score, time_ms, band, correct, created_at
  from public.scores
  order by case_id, lower(name), score desc, time_ms asc, created_at asc
)
select case_id, name, lname, score, time_ms, band, correct, created_at,
  rank() over (partition by case_id order by score desc, time_ms asc)::int as rank,
  count(*) over (partition by case_id)::int as players
from best;

create or replace view public.overall_ranks with (security_invoker = on) as
with best as (
  select distinct on (case_id, lower(name))
    case_id, name, lower(name) as lname, score, time_ms, created_at
  from public.scores
  order by case_id, lower(name), score desc, time_ms asc, created_at asc
), per as (
  select lname, (array_agg(name order by created_at desc))[1] as name,
    sum(score)::int as score, sum(time_ms)::bigint as time_ms,
    count(*)::int as cases, max(created_at) as created_at
  from best group by lname
)
select name, lname, score, time_ms, cases, created_at,
  rank() over (order by score desc, time_ms asc)::int as rank,
  count(*) over ()::int as players
from per;

revoke all on public.case_ranks, public.overall_ranks from public, anon, authenticated;
grant select on public.case_ranks, public.overall_ranks to anon, authenticated;

-- 6. Name ownership. The first post under a name claims it for that device's key
--    (a random 32-character code the app keeps in the browser). Later posts under
--    the same name, capitals ignored, must carry the same key. Only a hash of the
--    key is stored, in a table the API cannot read. Rows posted before this
--    section existed carry no key; the name's first keyed post claims it.
create table if not exists public.names (
  lname      text        primary key,
  key_hash   text        not null,
  claimed_at timestamptz not null default now()
);
alter table public.names enable row level security;
revoke all on public.names from public, anon, authenticated;

create or replace function public.scores_claim_name() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h text;
  held text;
begin
  if new.owner is null then
    raise exception 'A detective key is required to post' using errcode = 'P0001';
  end if;
  h := md5('synapse-owner:' || new.owner);
  select key_hash into held from names where lname = lower(new.name);
  if held is null then
    insert into names (lname, key_hash) values (lower(new.name), h) on conflict (lname) do nothing;
    select key_hash into held from names where lname = lower(new.name);
  end if;
  if held <> h then
    raise exception 'That name belongs to another detective' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.scores_claim_name() from public, anon, authenticated;
drop trigger if exists scores_claim_name on public.scores;
create trigger scores_claim_name before insert on public.scores
  for each row execute function public.scores_claim_name();

-- 7. How hard each case is, from everyone's posted runs: shown on the case cards.
create or replace view public.case_stats with (security_invoker = on) as
select case_id,
  count(*)::int                                                        as runs,
  count(distinct lower(name))::int                                     as players,
  round(avg(score))::int                                               as avg_score,
  round(100.0 * avg(case when correct then 1 else 0 end))::int         as solved_pct,
  round(100.0 * avg(case when correct and accusations = 1 then 1 else 0 end))::int as first_time_pct,
  (percentile_cont(0.5) within group (order by time_ms))::bigint       as median_ms
from public.scores
group by case_id;

revoke all on public.case_stats from public, anon, authenticated;
grant select on public.case_stats to anon, authenticated;
