-- Run in a transaction with the migration, then roll back.
do $$
#variable_conflict use_variable
declare id uuid; invitation uuid; r jsonb; d jsonb; vote jsonb; job public.meal_calendar_jobs; second_job public.meal_calendar_jobs;
begin
  d:='{"title":"Calendar test","location":"Toronto","timeZone":"America/Toronto","duration":90,"times":["2026-12-24T17:00:00.000Z","2026-12-25T17:00:00.000Z"],"restaurants":["A"],"restaurant":"A","selectedTime":"","status":"Unbooked","guests":[],"attending":[],"calendarEnabled":true}'::jsonb;
  r:=public.meal_planner_action('cal-test-host','Host','create',jsonb_build_object('details',d));id:=(r->>'id')::uuid;
  select invite into invitation from public.meal_plans p where p.id=id;
  perform public.meal_planner_action('cal-test-guest','Guest','join',jsonb_build_object('invite',invitation));
  r:=public.meal_planner_action('cal-test-guest','Guest','respond',jsonb_build_object('id',id,'version',1,'attendance','going','calendarAccept',true,'vote','{"times":["2026-12-24T17:00:00.000Z"],"restaurants":[]}'::jsonb));
  assert not(r?'error'),'Poll response failed';
  select response into vote from public.meal_plan_members where meal_id=id and account='cal-test-guest';
  assert vote->'confirmedSchedule'='null'::jsonb,'A poll must not confirm a calendar invitation';
  d:=d||'{"selectedTime":"2026-12-24T17:00:00.000Z"}'::jsonb;
  perform public.meal_planner_action('cal-test-host','Host','manage',jsonb_build_object('id',id,'version',1,'details',d));
  select response into vote from public.meal_plan_members where meal_id=id and account='cal-test-guest';
  assert vote->>'attendance'='maybe' and vote->>'needsReconfirmation'='true','Finalizing requires an actual RSVP';
  r:=public.meal_planner_action('cal-test-guest','Guest','respond',jsonb_build_object('id',id,'version',2,'attendance','going','calendarAccept',true,'vote','{"times":[],"restaurants":[]}'::jsonb));
  select response into vote from public.meal_plan_members where meal_id=id and account='cal-test-guest';
  assert vote->'confirmedSchedule'='["2026-12-24T17:00:00.000Z",90,"America/Toronto"]'::jsonb and vote->>'calendarAccept'='true','Confirmation must bind to exact date and duration';
  r:=public.meal_planner_action('outsider','Other','respond',jsonb_build_object('id',id,'version',2,'attendance','going','calendarAccept',true,'vote','{"times":[],"restaurants":[]}'::jsonb));
  assert r?'error','Outsider cannot confirm';
  d:=d||'{"selectedTime":"2026-12-25T17:00:00.000Z"}'::jsonb;
  perform public.meal_planner_action('cal-test-host','Host','manage',jsonb_build_object('id',id,'version',2,'details',d));
  select response into vote from public.meal_plan_members where meal_id=id and account='cal-test-guest';
  assert not(vote?'confirmedSchedule') and vote->>'attendance'='maybe','Rescheduling invalidates previous acceptance';
  select * into job from public.meal_calendar_claim(id);
  select * into second_job from public.meal_calendar_claim(id);
  assert job.lease is not null and second_job.lease is null,'Only one worker can claim a dinner';
  perform public.meal_calendar_enqueue(id);
  perform public.meal_calendar_finish(id,job.lease,job.generation,true);
  assert exists(select 1 from public.meal_calendar_jobs where meal_id=id and lease is null),'A new change during sync must survive completion';
  insert into public.meal_calendar_connections(account,provider,subject,email,refresh_cipher,scopes) values
    ('microsoft:cal-test-ms','microsoft','test-sub','test@example.com','encrypted-test','Calendars.ReadWrite');
  perform public.meal_microsoft_action('cal-test-ms','Outlook','join',jsonb_build_object('invite',invitation));
  perform public.meal_microsoft_action('cal-test-ms','Outlook','link','{}','cal-test-guest');
  assert (select count(*)=1 from public.meal_calendar_connections where account='cal-test-guest'),'Calendar connection must follow linked identity';
  assert (select count(*)=1 from public.meal_plan_members where meal_id=id and account in ('cal-test-guest','microsoft:cal-test-ms')),'Linking must not duplicate membership';
  r:=public.meal_planner_action('cal-test-guest','Guest','list','{}');
  assert not(r::text like '%encrypted-test%') and not(r::text like '%test@example.com%'),'Meals must not expose calendar credentials or mailbox addresses';
  d:=d||'{"cancelled":true}'::jsonb;
  perform public.meal_planner_action('cal-test-host','Host','manage',jsonb_build_object('id',id,'version',3,'details',d));
  r:=public.meal_planner_action('cal-test-guest','Guest','respond',jsonb_build_object('id',id,'version',4,'attendance','going','vote','{"times":[],"restaurants":[]}'::jsonb));
  assert r?'error','Cancelled dinners cannot accept responses';
  assert not has_table_privilege('anon','public.meal_calendar_connections','select'),'Anonymous calendar access forbidden';
  assert not has_table_privilege('authenticated','public.meal_calendar_connections','select'),'Direct client calendar access forbidden';
end $$;
select 'PASS calendar permissions, poll vs RSVP, rescheduling, cancellation, identity merge and concurrent retry queue' as result;
