-- Run with all migrations inside a transaction, then roll back.
do $$
declare dinner uuid; invitation uuid; d jsonb; r jsonb; own jsonb; actor text; peer text; resolved_actor text;
begin
  d:='{"title":"Privacy fixture","location":"Toronto","timeZone":"America/Toronto","duration":90,
    "times":["2026-12-24T17:00:00.000Z","2026-12-25T17:00:00.000Z","2026-12-26T17:00:00.000Z"],
    "restaurants":["Cedar","Garden"],"selectedTime":"","restaurant":"","status":"Unbooked","guests":[],"attending":[],
    "responses":[{"name":"Stale peer","vote":{"times":["STALE_PRIVATE_TIME"]}}],
    "joinedCount":99,"timeTallies":["STALE_PRIVATE_TIME"],"unknown":{"vote":"STALE_PRIVATE_TIME"}}'::jsonb;
  r:=public.meal_planner_action('privacy-host','Host','create',jsonb_build_object('details',d));
  dinner:=(r->>'id')::uuid;
  select invite into invitation from public.meal_plans where id=dinner;
  perform public.meal_planner_action('privacy-a','Guest A','join',jsonb_build_object('invite',invitation));
  perform public.meal_microsoft_action('privacy-b','Guest B','join',jsonb_build_object('invite',invitation));
  perform public.meal_microsoft_action('privacy-host-ms','Host','link','{}','privacy-host');
  perform public.meal_planner_action('privacy-host','Host','respond',jsonb_build_object('id',dinner,'version',1,
    'vote','{"times":["2026-12-24T17:00:00.000Z"],"restaurants":["Cedar"]}'::jsonb));
  perform public.meal_planner_action('privacy-a','Guest A','respond',jsonb_build_object('id',dinner,'version',1,
    'vote','{"times":["2026-12-25T17:00:00.000Z"],"restaurants":["Cedar","Garden"]}'::jsonb));
  perform public.meal_microsoft_action('privacy-b','Guest B','respond',jsonb_build_object('id',dinner,'version',1,
    'vote','{"times":["2026-12-26T17:00:00.000Z"],"restaurants":["Garden"]}'::jsonb));
  -- Google and Microsoft callers retain only the fields allowed for their role.
  foreach actor in array array['privacy-host','privacy-a','microsoft:privacy-b','microsoft:privacy-host-ms'] loop
    resolved_actor:=case when actor='microsoft:privacy-host-ms' then 'privacy-host' else actor end;
    if actor like 'microsoft:%' then
      r:=public.meal_microsoft_action(substr(actor,11),'Caller','list','{}')->0;
    else r:=public.meal_planner_action(actor,'Caller','list','{}')->0; end if;
    select response into own from public.meal_plan_members where meal_id=dinner and account=resolved_actor;
    assert r->'myVote'=own, 'Caller must retain their own response';
    if resolved_actor='privacy-host' then
      assert r->'hasOtherResponses'='true'::jsonb, 'Sharing guidance uses a boolean';
      assert r->'restaurantTallies'='[{"value":"Cedar","count":2},{"value":"Garden","count":2}]'::jsonb,
        'Restaurant counts must be anonymous';
    else
      assert r->'hasOtherResponses'='false'::jsonb, 'Guests cannot see whether others responded';
      assert r->'restaurantTallies'='[]'::jsonb, 'Guests cannot see restaurant totals';
    end if;
    assert not(r ?| array['responses','joinedCount','timeTallies','unknown']), 'No legacy response fields';
    -- Public candidate options can contain the same instants. Strip those and
    -- own data before searching the entire remaining JSON for peer answer values.
    assert not ((r-'times'-'myVote')::text ~ '2026-12-(24|25|26)|STALE_PRIVATE_TIME|Guest A|Guest B'),
      'Peer time answers and names cannot appear anywhere in the projection';
    for peer in select response::text from public.meal_plan_members where meal_id=dinner and account<>resolved_actor loop
      assert position(peer in r::text)=0, 'No other member response may be serialized';
    end loop;
    assert r->'attendanceResponses'='[]'::jsonb, 'An open poll has no final attendance';
  end loop;
  assert public.meal_planner_action('privacy-outsider','Other','list','{}')='[]'::jsonb, 'Participant access only';
  d:=d||'{"selectedTime":"2026-12-24T17:00:00.000Z","restaurant":"Cedar"}'::jsonb;
  perform public.meal_planner_action('privacy-host','Host','manage',jsonb_build_object('id',dinner,'version',1,'details',d));
  perform public.meal_planner_action('privacy-a','Guest A','rsvp',jsonb_build_object('id',dinner,'attendance','going'));
  foreach actor in array array['maybe','declined'] loop
    perform public.meal_microsoft_action('privacy-b','Guest B','rsvp',jsonb_build_object('id',dinner,'attendance',actor));
    foreach peer in array array['privacy-host','privacy-a','microsoft:privacy-b','microsoft:privacy-host-ms'] loop
      if peer like 'microsoft:%' then
        r:=public.meal_microsoft_action(substr(peer,11),'Caller','list','{}')->0;
      else r:=public.meal_planner_action(peer,'Caller','list','{}')->0; end if;
      assert r->'restaurantTallies'='[]'::jsonb, 'Closed restaurant poll has no totals';
      assert r->'hasOtherResponses'=to_jsonb(peer in ('privacy-host','microsoft:privacy-host-ms')),
        'Only the organizer sees whether others responded after finalization';
      assert r->'attendanceResponses'='[{"name":"Guest A","attendance":"going"}]'::jsonb,
        'Only affirmative final attendance is disclosed';
      assert position('Guest B' in (r-'myVote')::text)=0, 'No named negative or tentative attendance';
    end loop;
  end loop;
  update public.meal_plan_members set response=response||'{"needsReconfirmation":true}'::jsonb where meal_id=dinner and account='privacy-a';
  r:=public.meal_planner_action('privacy-host','Host','list','{}')->0;
  assert r->'attendanceResponses'='[]'::jsonb, 'Stale going must not disclose participation';
  assert not has_function_privilege('anon','public.meal_planner_action(text,text,text,jsonb)','execute'), 'No anonymous RPC';
  assert not has_function_privilege('authenticated','public.meal_planner_action(text,text,text,jsonb)','execute'), 'No direct browser RPC';
end $$;
