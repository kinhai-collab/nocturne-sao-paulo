-- Synthetic service-only fixtures. The harness rolls back every fixture file.
do $$
declare dinner uuid; invitation uuid; d jsonb; r jsonb; rev bigint; hash text; old_rev bigint; i int;
begin
  assert not has_table_privilege('anon','public.meal_agent_results','select,insert,update,delete');
  assert not has_table_privilege('authenticated','public.meal_agent_results','select,insert,update,delete');
  begin
    set local role anon;
    perform 1 from public.meal_agent_results;
    assert false, 'Anonymous SELECT must be denied';
  exception when insufficient_privilege then null; end;
  begin
    set local role authenticated;
    perform 1 from public.meal_agent_results;
    assert false, 'Authenticated SELECT must be denied';
  exception when insufficient_privilege then null; end;
  assert (select relrowsecurity from pg_class where oid='public.meal_agent_results'::regclass);
  assert not has_function_privilege('anon','public.meal_agent_begin(uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.meal_agent_save(uuid,text,bigint,text,timestamptz,text)','execute');
  assert not has_function_privilege('authenticated','public.purge_meal_scheduling_data(timestamptz,uuid)','execute');
  assert not has_function_privilege('anon','public.purge_meal_scheduling_data(timestamptz,uuid)','execute');
  assert has_function_privilege('service_role','public.purge_meal_scheduling_data(timestamptz,uuid)','execute');
  d:='{"title":"Agent fixture","duration":90,"timeZone":"America/Toronto",
    "times":["2099-12-25T19:00:00.000Z","2099-12-24T19:00:00.000Z"],"restaurants":["Cedar"],
    "selectedTime":"","restaurant":"","guests":[],"attending":[],"status":"Unbooked"}';
  r:=public.meal_planner_action('agent-host','Host','create',jsonb_build_object('details',d)); dinner:=(r->>'id')::uuid;
  select invite into invitation from public.meal_plans where id=dinner;
  perform public.meal_planner_action('agent-host','Host','vote',jsonb_build_object('id',dinner,'vote',jsonb_build_object('times',d->'times','restaurants','[]'::jsonb)));
  for i in 1..8 loop
    assert public.meal_agent_begin(dinner,'agent-host')='{"status":"waiting"}'::jsonb;
  end loop;
  assert (select runs_count from public.meal_agent_results where meal_id=dinner)=0, 'Waiting never reserves quota';
  perform public.meal_planner_action('agent-a','A','join',jsonb_build_object('invite',invitation));
  insert into public.meal_microsoft_links values('gate-alias','agent-a'),('host-alias','agent-host');
  insert into public.meal_plan_members values(dinner,'microsoft:gate-alias','Alias',null),(dinner,'microsoft:host-alias','Host alias',null);
  assert public.meal_agent_begin(dinner,'agent-host')='{"status":"waiting"}'::jsonb, 'Canonical aliases cannot pass the gate';
  assert (select runs_count from public.meal_agent_results where meal_id=dinner)=0;
  perform public.meal_planner_action('agent-b','B','join',jsonb_build_object('invite',invitation));
  assert public.meal_agent_begin(dinner,'agent-a')->>'error'='forbidden';
  r:=public.meal_agent_begin(dinner,'agent-host'); rev:=(r->>'input_rev')::bigint;
  assert r->'times'=d->'times', 'Saved option order';
  assert jsonb_array_length(r->'participants')=3, 'Untouched joined members are included';
  assert r->'participants' @> '[{"memberRef":"agent-a","times":[]}]';
  hash:=public.meal_agent_options_hash(d);
  assert hash='7f351ed9e03eb96413d7a1081f68849667c508c63670cf61a1963881da9e83e9', 'Same ordered JSON hash as WebCrypto';
  r:=public.meal_agent_save(dinner,'agent-host',rev,'works','2099-12-25T19:00:00.000Z',hash);
  assert not(r ? 'error'), 'Valid save';
  assert r->'agentResult'->>'proposedTime'='2099-12-25T19:00:00.000Z';
  r:=public.meal_planner_action('agent-host','Host','list','{}')->0;
  assert r->'agentResult'->>'status'='works';
  assert (select count(*) from jsonb_object_keys(r->'agentResult'))=4;
  assert not(r::text ~ 'input_rev|runs_count|runs_on|memberRef');
  r:=public.meal_agent_save(dinner,'agent-host',rev,'none',null,hash);
  assert not(r->'agentResult' ? 'proposedTime'), 'None has no proposed time';
  assert (select count(*) from jsonb_object_keys(r->'agentResult'))=3;
  r:=public.meal_planner_action('agent-a','A','list','{}');
  assert position('agentResult' in r::text)=0, 'No agent key anywhere in a guest list';
  perform public.meal_planner_action('agent-a','A','vote',jsonb_build_object('id',dinner,'vote',jsonb_build_object('times',d->'times','restaurants','["Cedar"]'::jsonb)));
  assert public.meal_agent_save(dinner,'agent-host',rev,'works','2099-12-25T19:00:00.000Z',hash)->>'error'='stale';
  assert not((public.meal_planner_action('agent-host','Host','list','{}')->0) ? 'agentResult');
  assert (select runs_count from public.meal_agent_results where meal_id=dinner)=1, 'Invalidation preserves quota';
  for i in 2..6 loop
    r:=public.meal_agent_begin(dinner,'agent-host'); assert not(r ? 'error');
  end loop;
  assert public.meal_agent_begin(dinner,'agent-host')->>'error'='agent_limit', 'Seventh run fails, even without saving previous attempts';
  delete from public.meal_plan_members where meal_id=dinner and account='agent-b';
  assert public.meal_agent_begin(dinner,'agent-host')='{"status":"waiting"}'::jsonb, 'Minimum group gate precedes even an exhausted quota';
  assert (select runs_count from public.meal_agent_results where meal_id=dinner)=6;
  perform public.meal_planner_action('agent-b','B','join',jsonb_build_object('invite',invitation));
  update public.meal_agent_results set runs_on=(now() at time zone 'UTC')::date-1 where meal_id=dinner;
  r:=public.meal_agent_begin(dinner,'agent-host'); assert not(r ? 'error');
  assert (select runs_count from public.meal_agent_results where meal_id=dinner)=1;
  rev:=(r->>'input_rev')::bigint;
  update public.meal_plans set details=jsonb_set(details,'{duration}','120') where id=dinner;
  assert public.meal_agent_save(dinner,'agent-host',rev,'none',null,hash)->>'error'='stale';
  select input_rev into old_rev from public.meal_agent_results where meal_id=dinner;
  insert into public.meal_calendar_connections(account,provider,subject,email,refresh_cipher,scopes,status)
    values('agent-a','google','agent-google','a@example.com','synthetic','synthetic','connected');
  assert (select input_rev>old_rev from public.meal_agent_results where meal_id=dinner), 'Calendar connections invalidate';
  select input_rev into old_rev from public.meal_agent_results where meal_id=dinner;
  update public.meal_calendar_connections set refresh_cipher='rotated' where account='agent-a';
  assert (select input_rev=old_rev from public.meal_agent_results where meal_id=dinner), 'Refresh rotation alone is not an input edit';
  update public.meal_calendar_connections set status='reconnect' where account='agent-a';
  assert (select input_rev>old_rev from public.meal_agent_results where meal_id=dinner);
  select input_rev into old_rev from public.meal_agent_results where meal_id=dinner;
  delete from public.meal_calendar_connections where account='agent-a';
  assert (select input_rev>old_rev from public.meal_agent_results where meal_id=dinner);
  -- Canonical aliases cannot inflate the frozen roster; prefer the canonical ballot.
  r:=public.meal_agent_begin(dinner,'agent-host');
  assert jsonb_array_length(r->'participants')=3;
  assert position('microsoft:' in (r->'participants')::text)=0;
end $$;

do $$
declare target uuid; overdue uuid; d jsonb; r jsonb;
begin
  d:='{"title":"Targeted purge","duration":90,"timeZone":"UTC","times":["2001-01-01T19:00:00.000Z"],
    "selectedTime":"2001-01-01T19:00:00.000Z","restaurant":"Cedar","restaurants":["Cedar"],"guests":[],"attending":[]}';
  insert into public.meal_plans(owner,details) values('target-host',d) returning id into target;
  insert into public.meal_plans(owner,details) values('overdue-host',d) returning id into overdue;
  alter table public.meal_plan_members disable trigger meal_agent_member_changed;
  insert into public.meal_plan_members values(target,'target-host','Host','{"times":["PRIVATE"]}'),
    (overdue,'overdue-host','Host','{"times":["PRIVATE"]}');
  alter table public.meal_plan_members enable trigger meal_agent_member_changed;
  r:=public.meal_planner_action('target-host','Host','manage',jsonb_build_object('id',target,'version',1,'details',d||'{"cancelled":true}'));
  assert not(r ? 'error');
  assert not exists(select 1 from public.meal_plan_members where meal_id=target and response ? 'times');
  assert exists(select 1 from public.meal_plan_members where meal_id=overdue and response ? 'times'), 'Manage purges only its dinner';
  perform public.meal_planner_action('overdue-host','Host','list','{}');
  assert exists(select 1 from public.meal_plan_members where meal_id=overdue and response ? 'times'), 'List never purges';
  perform public.purge_meal_scheduling_data();
  assert not exists(select 1 from public.meal_plan_members where meal_id=overdue and response ? 'times'), 'Global scheduled sweep still purges';
end $$;

do $$
declare dinner uuid; d jsonb; r jsonb; state text; v int;
begin
  foreach state in array array['cancelled','past','open','future','expired'] loop
    d:=jsonb_build_object('title',state,'duration',90,'timeZone','UTC','restaurants',jsonb_build_array('Cedar'),
      'times',jsonb_build_array('2001-01-01T19:00:00.000Z','2099-01-01T19:00:00.000Z'),'guests','[]'::jsonb,'attending','[]'::jsonb,
      'selectedTime',case when state in ('past','expired') then '2001-01-01T19:00:00.000Z' when state='future' then '2099-01-01T19:00:00.000Z' else '' end,
      'restaurant',case when state='open' then '' else 'Cedar' end,'status','Unbooked');
    insert into public.meal_plans(owner,details) values('purge-'||state,d) returning id into dinner;
    insert into public.meal_plan_members values(dinner,'purge-'||state,'Host','{"times":["PRIVATE"],"restaurants":["Cedar"],"attendance":"going"}');
    -- Simulate an overdue pre-migration ballot, bypassing only the guard trigger.
    alter table public.meal_plan_members disable trigger meal_agent_member_changed;
    update public.meal_plan_members set response=response||'{"times":["PRIVATE"]}' where meal_id=dinner;
    alter table public.meal_plan_members enable trigger meal_agent_member_changed;
    update public.meal_plans set details=details||'{"myVote":{"times":["OWNER_PRIVATE"],"restaurants":["Cedar"]}}' where id=dinner;
    if state='cancelled' then
      -- Exercise the actual version-checked cancel path.
      perform public.meal_planner_action('purge-cancelled','Host','manage',jsonb_build_object('id',dinner,'version',1,'details',d||'{"cancelled":true}'));
      assert not exists(select 1 from public.meal_plan_members where meal_id=dinner and response ? 'times'), 'Cancel path purges immediately';
    elsif state='past' then
      -- Recent ended dinner retains its coarse row for at most thirty days.
      update public.meal_plans set details=jsonb_set(details,'{selectedTime}',to_jsonb(to_char(now()-interval '1 day','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id=dinner;
    end if;
    r:=public.meal_planner_action('purge-'||state,'Host','list','{}')->0;
    if state in ('past','expired') then
      assert not(r->'myVote' ? 'times') and not(r ? 'agentResult'), 'Ended reads are guarded without a purge';
      assert exists(select 1 from public.meal_plan_members where meal_id=dinner and response ? 'times'), 'List does not purge';
    end if;
    perform public.purge_meal_scheduling_data(now(),dinner);
    perform public.purge_meal_scheduling_data();
    select response into r from public.meal_plan_members where meal_id=dinner;
    assert r->'restaurants'='["Cedar"]' and r->>'attendance'='going', 'Restaurant votes and Going survive';
    if state in ('open','future') then
      assert r ? 'times', 'Open/future-approved ballots remain';
    else
      assert not(r ? 'times'), 'Ended ballots disappear';
      assert not exists(select 1 from public.meal_plans where id=dinner and details->'myVote' ? 'times');
      if state<>'cancelled' then
        assert (select details->'myVote'->'restaurants'='["Cedar"]'::jsonb from public.meal_plans where id=dinner), 'Owner ballot copy retains restaurant vote';
      end if;
      if state='past' then assert exists(select 1 from public.meal_agent_results where meal_id=dinner), 'Recent coarse row may remain until thirty days'; end if;
      -- RSVP and legacy vote cannot resurrect time defaults after purge.
      perform public.meal_planner_action('purge-'||state,'Host','rsvp',jsonb_build_object('id',dinner,'attendance','going'));
      perform public.meal_planner_action('purge-'||state,'Host','vote',jsonb_build_object('id',dinner,'vote',jsonb_build_object('times','[]'::jsonb,'restaurants','["Cedar"]'::jsonb)));
      assert not exists(select 1 from public.meal_plan_members where meal_id=dinner and response ? 'times');
      assert public.meal_agent_begin(dinner,'purge-'||state)->>'error'='unavailable';
      if state in ('cancelled','expired') then
        assert not exists(select 1 from public.meal_agent_results where meal_id=dinner), 'Terminal retention deadline';
      end if;
    end if;
  end loop;
end $$;
