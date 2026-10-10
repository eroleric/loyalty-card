-- Run after the migration, in the dedicated Loyalty Card SQL Editor.
-- Fictional user rows and profile data exist only inside this transaction.
-- ROLLBACK preserves existing records and removes every test change.
begin;

do $$ begin
  if exists (select 1 from auth.users where id in (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222')) then
    raise exception 'Test IDs already exist; choose unused fictional IDs.';
  end if;
end $$;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true),
       set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare
  p jsonb := '{"schemaVersion":1,"firstName":"Taylor","lastName":"","email":"","phone":"","addressLine1":"","addressLine2":"","city":"","region":"","postalCode":"","country":"","dateOfBirth":"","emailOffers":false,"smsOffers":false}';
  blocked boolean := false;
begin
  if auth.uid() is distinct from '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'User A claim setup failed.';
  end if;
  insert into public.loyalty_profiles(user_id, profile) values (auth.uid(), p);
  if (select count(*) from public.loyalty_profiles) <> 1 then raise exception 'Own read failed.'; end if;
  if (select updated_at is null from public.loyalty_profiles where user_id=auth.uid()) then raise exception 'Server timestamp missing.'; end if;
  begin
    insert into public.loyalty_profiles(user_id, profile) values ('22222222-2222-4222-8222-222222222222', p);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Foreign insert was allowed.'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true),
       set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare
  p jsonb := '{"schemaVersion":1,"firstName":"Jordan","lastName":"","email":"","phone":"","addressLine1":"","addressLine2":"","city":"","region":"","postalCode":"","country":"","dateOfBirth":"","emailOffers":false,"smsOffers":false}';
  affected integer;
  blocked boolean := false;
begin
  if (select count(*) from public.loyalty_profiles) <> 0 then raise exception 'Foreign read exposed a profile.'; end if;
  update public.loyalty_profiles set profile=p where user_id='11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign update was allowed.'; end if;
  delete from public.loyalty_profiles where user_id='11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign delete was allowed.'; end if;
  begin
    insert into public.loyalty_profiles(user_id,profile) values ('11111111-1111-4111-8111-111111111111',p)
      on conflict(user_id) do update set user_id=excluded.user_id, profile=excluded.profile;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Foreign upsert was allowed.'; end if;
  insert into public.loyalty_profiles(user_id,profile) values (auth.uid(),p);
  if (select profile->>'firstName' from public.loyalty_profiles) is distinct from 'Jordan' then raise exception 'User B own read failed.'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true),
       set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare
  p jsonb;
  bad jsonb;
  blocked boolean;
  affected integer;
begin
  select profile into p from public.loyalty_profiles where user_id=auth.uid();
  if p->>'firstName' is distinct from 'Taylor' then raise exception 'Foreign writes changed user A.'; end if;
  insert into public.loyalty_profiles(user_id,profile) values (auth.uid(),jsonb_set(p,'{firstName}','"Updated"'))
    on conflict(user_id) do update set user_id=excluded.user_id, profile=excluded.profile;
  if (select profile->>'firstName' from public.loyalty_profiles) is distinct from 'Updated' then raise exception 'Own upsert failed.'; end if;
  blocked := false;
  begin
    update public.loyalty_profiles set updated_at='2000-01-01' where user_id=auth.uid();
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Client could replace server timestamp.'; end if;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    p || '{"password":"forbidden"}'::jsonb,
    p || '{"email":"invalid"}'::jsonb,
    p || '{"phone":"123"}'::jsonb,
    p || '{"dateOfBirth":"2025-02-30"}'::jsonb,
    p || '{"smsOffers":"true"}'::jsonb,
    p || jsonb_build_object('firstName',repeat('x',101)))) loop
    blocked := false;
    begin
      update public.loyalty_profiles set profile=bad where user_id=auth.uid();
    exception when check_violation then blocked := true;
    end;
    if not blocked then raise exception 'Invalid profile data was accepted.'; end if;
  end loop;
  delete from public.loyalty_profiles where user_id=auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own delete failed.'; end if;
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
do $$
declare blocked boolean := false;
begin
  begin perform 1 from public.loyalty_profiles;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous read was allowed.'; end if;
  blocked := false;
  begin delete from public.loyalty_profiles;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous delete was allowed.'; end if;
  blocked := false;
  begin update public.loyalty_profiles set profile='{}';
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous update was allowed.'; end if;
  blocked := false;
  begin insert into public.loyalty_profiles(user_id,profile) values ('11111111-1111-4111-8111-111111111111','{}');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous insert was allowed.'; end if;
end $$;
reset role;

rollback;
select 'PASS: own CRUD, user isolation, anonymous denial, validation; all test data rolled back' as verification;
