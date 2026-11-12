-- Apply after the calendar migration and after provisioning the matching
-- CALENDAR_WORKER_SECRET in Supabase Vault as enkai_calendar_worker.
-- The job definition contains no credential. pg_net responses are diagnostic
-- only; calendar job leases and generation numbers provide retry safety.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('enkai-calendar-sync', '* * * * *', $job$
  select net.http_post(
    url := 'https://mxmqqqzxopjinlkjtcnb.supabase.co/functions/v1/calendar-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  from vault.decrypted_secrets secret
  where secret.name = 'enkai_calendar_worker'
    and exists (select 1 from public.meal_calendar_jobs
      where run_after <= now() and (leased_until is null or leased_until < now()));
$job$);
