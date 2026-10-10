-- Run on a dedicated Loyalty Card Supabase project, before enabling the UI.
create function public.loyalty_profile_is_valid(value jsonb)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  field text;
  limits jsonb := '{"firstName":100,"lastName":100,"email":254,"phone":40,"addressLine1":150,"addressLine2":150,"city":100,"region":100,"postalCode":20,"country":100,"dateOfBirth":10}';
  birthday date;
  has_details boolean := false;
begin
  if value is null or pg_catalog.jsonb_typeof(value) <> 'object'
     or value->'schemaVersion' is distinct from '1'::jsonb
     or pg_catalog.jsonb_typeof(value->'emailOffers') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(value->'smsOffers') is distinct from 'boolean' then return false; end if;
  for field in select pg_catalog.jsonb_object_keys(value) loop
    if not (limits ? field) and field not in ('schemaVersion','emailOffers','smsOffers') then return false; end if;
  end loop;
  for field in select pg_catalog.jsonb_object_keys(limits) loop
    if pg_catalog.jsonb_typeof(value->field) is distinct from 'string'
       or pg_catalog.char_length(value->>field) > (limits->>field)::integer then return false; end if;
    if pg_catalog.btrim(value->>field) <> '' then has_details := true; end if;
  end loop;
  if not has_details then return false; end if;
  if value->>'email' <> '' and value->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false; end if;
  if value->>'phone' <> '' and (value->>'phone' !~ '^[+0-9[:space:]().-]+$'
     or pg_catalog.char_length(pg_catalog.regexp_replace(value->>'phone', '[^0-9]', '', 'g')) not between 7 and 15) then return false; end if;
  if value->>'dateOfBirth' <> '' then
    if value->>'dateOfBirth' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
    begin
      birthday := (value->>'dateOfBirth')::date;
    exception when others then return false; end;
    if birthday > current_date or pg_catalog.to_char(birthday, 'YYYY-MM-DD') <> value->>'dateOfBirth' then return false; end if;
  end if;
  return true;
end;
$$;
revoke all on function public.loyalty_profile_is_valid(jsonb) from public, anon, authenticated;
grant execute on function public.loyalty_profile_is_valid(jsonb) to authenticated;

create table public.loyalty_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null check (public.loyalty_profile_is_valid(profile)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.loyalty_profile_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.user_id <> old.user_id then raise exception 'Profile owner cannot change.'; end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function public.loyalty_profile_touch() from public, anon, authenticated;
create trigger loyalty_profiles_touch before insert or update on public.loyalty_profiles
  for each row execute function public.loyalty_profile_touch();

alter table public.loyalty_profiles enable row level security;
alter table public.loyalty_profiles force row level security;
revoke all on table public.loyalty_profiles from public, anon, authenticated;
grant select, delete on table public.loyalty_profiles to authenticated;
grant insert (user_id, profile), update (user_id, profile) on public.loyalty_profiles to authenticated;

create policy "Read own profile" on public.loyalty_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own profile" on public.loyalty_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own profile" on public.loyalty_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own profile" on public.loyalty_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);
