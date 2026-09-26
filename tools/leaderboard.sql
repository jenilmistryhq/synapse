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

-- 1. Privileges: Supabase grants broad rights to the API roles by default.
--    Take them all back, then give exactly what the game needs. Inserting is
--    limited to the game's columns, so nobody can choose id or created_at.
revoke all on public.scores from public, anon, authenticated;
grant select on public.scores to anon, authenticated;
grant insert (case_id, name, score, time_ms, band, correct, accusations, authorities)
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
