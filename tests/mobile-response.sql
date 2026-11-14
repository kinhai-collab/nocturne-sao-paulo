-- Run after the new migration inside a transaction, then roll back.
do $$
declare p uuid; link uuid; result jsonb; before_vote jsonb; after_vote jsonb;
begin
  insert into public.meal_plans(owner,details) values('mobile-test-host',
    '{"title":"Test dinner","location":"Toronto","timeZone":"America/Toronto","duration":90,
    "times":["2026-12-24T17:00:00.000Z","2026-12-25T17:00:00.000Z"],
    "restaurants":["A","B"],"selectedTime":"","restaurant":"","status":"Unbooked","guests":[],"attending":[]}')
    returning id,invite into p,link;
  perform public.meal_planner_action('mobile-test-guest','Guest','join',jsonb_build_object('invite',link));
  result:=public.meal_planner_action('mobile-test-guest','Guest','respond',jsonb_build_object('id',p,'version',1,
    'vote','{"times":["2026-12-24T17:00:00.000Z"],"restaurants":["B"]}'::jsonb));
  assert not(result?'error'),'Combined response failed';
  result:=public.meal_planner_action('mobile-test-guest','Guest','rsvp',jsonb_build_object('id',p,'attendance','going','calendarAccept',true));
  assert result?'error','A legacy RSVP cannot confirm an undecided plan';
  select response into before_vote from public.meal_plan_members where meal_id=p and account='mobile-test-guest';
  assert not(before_vote?'attendance') and before_vote->'restaurants'='["B"]'::jsonb,'Availability must save without a premature RSVP';
  result:=public.meal_planner_action('mobile-test-guest','Guest','respond',jsonb_build_object('id',p,'version',1,'attendance','declined',
    'vote','{"times":[],"restaurants":["Invalid"]}'::jsonb));
  select response into after_vote from public.meal_plan_members where meal_id=p and account='mobile-test-guest';
  assert result?'error' and after_vote=before_vote,'Invalid vote must not partially save RSVP';
  result:=public.meal_planner_action('outsider','Other','respond',jsonb_build_object('id',p,'version',1,'attendance','going',
    'vote','{"times":[],"restaurants":[]}'::jsonb));
  assert result?'error','Non-member response must fail';
  result:=public.meal_planner_action('mobile-test-guest','Guest','respond',jsonb_build_object('id',p,'version',0,'attendance','maybe',
    'vote','{"times":[],"restaurants":[]}'::jsonb));
  assert result?'error','Stale version must fail';
  update public.meal_plans set details=details||'{"selectedTime":"2026-12-24T17:00:00.000Z","restaurant":"B"}'::jsonb,version=2 where id=p;
  result:=public.meal_planner_action('mobile-test-guest','Guest','respond',jsonb_build_object('id',p,'version',2,'vote','{"times":[],"restaurants":[]}'::jsonb));
  assert result?'error','Final RSVP must require an explicit attendance choice';
  result:=public.meal_planner_action('mobile-test-guest','Guest','respond',jsonb_build_object('id',p,'version',2,'attendance','maybe',
    'vote','{"times":[],"restaurants":[]}'::jsonb));
  select response into after_vote from public.meal_plan_members where meal_id=p and account='mobile-test-guest';
  assert not(result?'error') and after_vote->>'attendance'='maybe','Fixed dinner RSVP must save';
  assert after_vote->'times'=before_vote->'times' and after_vote->'restaurants'=before_vote->'restaurants','Finalizing must preserve historical votes';
  perform public.meal_microsoft_action('mobile-test-ms','Outlook guest','join',jsonb_build_object('invite',link));
  result:=public.meal_microsoft_action('mobile-test-ms','Outlook guest','respond',jsonb_build_object('id',p,'version',2,'attendance','going',
    'vote','{"times":[],"restaurants":[]}'::jsonb));
  assert not(result?'error'),'Microsoft response must save';
  result:=public.meal_microsoft_action('mobile-test-ms','Outlook guest','link','{}','mobile-test-guest');
  assert not(result?'error'),'Identity linking must work';
  assert (select count(*)=1 from public.meal_plan_members where meal_id=p and account in ('mobile-test-guest','microsoft:mobile-test-ms')),'Linked identity must not duplicate membership';
  select response into after_vote from public.meal_plan_members where meal_id=p and account='mobile-test-guest';
  assert after_vote->>'attendance'='maybe' and after_vote->'restaurants'='["B"]'::jsonb,'Linking must preserve existing response';
  result:=public.meal_planner_action('mobile-test-host','Host','manage',jsonb_build_object('id',p,'version',2,'details',(select details||'{"restaurant":"A"}'::jsonb from public.meal_plans where id=p)));
  assert not(result?'error'),'Changing the final restaurant must save';
  select response into after_vote from public.meal_plan_members where meal_id=p and account='mobile-test-guest';
  assert after_vote->>'needsReconfirmation'='true' and not(after_vote?'confirmedSchedule'),'Changing the restaurant requires a fresh RSVP';
  result:=public.meal_planner_action('mobile-test-host','Host','list','{}');
  assert (select m->'attendanceResponses'='[]'::jsonb from jsonb_array_elements(result) m where m->>'id'=p::text),'Unconfirmed responses must not count as attendance';
end $$;
select 'Atomic responses, authorization, stale writes, fixed dinners, and Microsoft linking passed' as result;
