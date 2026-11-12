# Enkai calendar integration

This integration is separate from Google/Microsoft sign-in. Never put provider
client secrets or refresh credentials in config.js, GitHub Pages, browser storage,
logs, command arguments, screenshots, or committed files.

## Provider configuration

Create dedicated web OAuth clients called **Enkai Calendar Sync**. Preserve the
existing sign-in clients and redirect addresses.

Both providers use this exact server redirect:

`https://mxmqqqzxopjinlkjtcnb.supabase.co/functions/v1/calendar-callback`

Google: enable Calendar API; request `openid email calendar.events` (the latter
uses the full `https://www.googleapis.com/auth/` prefix). Configure the consent
screen and any required verification before general availability. Testing-mode
refresh credentials may expire; do not describe testing mode as a production rollout.

Microsoft: personal Microsoft accounts, Web redirect platform; delegated
`User.Read` and `Calendars.ReadWrite`, plus `openid email profile offline_access`.
No tenant-wide calendar access or application permissions are needed.

Set these server secrets using a private input stream or temporary file outside
the checkout that is immediately deleted:

- `CALENDAR_GOOGLE_CLIENT_ID`, `CALENDAR_GOOGLE_CLIENT_SECRET`
- `CALENDAR_MICROSOFT_CLIENT_ID`, `CALENDAR_MICROSOFT_CLIENT_SECRET`
- `CALENDAR_ENCRYPTION_KEY`: random 32 bytes, base64url encoded
- `CALENDAR_WORKER_SECRET`: random 32+ bytes

Keep the encryption key stable. Changing it requires reconnecting calendars.
Refresh credentials use AES-GCM with provider/subject authenticated context;
states are hashed, expire after ten minutes, and are consumed once. Both OAuth
flows use PKCE and verified ID-token nonces. Tables have RLS enabled and are
accessible only to the service role. Conflict event details are never stored.

## Deployment order

1. Run the SQL migration and regression tests inside a transaction, then roll back.
2. Apply `202611120002_calendar_sync.sql`; existing dinners do not automatically
   opt into calendar invitations. Hosts must enable that dinner explicitly.
3. Set secrets and deploy `calendar-callback`, `calendar-worker`, `meal-planner`.
4. Enable `pg_cron` and `pg_net`. Store the worker secret in Supabase Vault under
   `enkai_calendar_worker`. Schedule one POST each minute to the calendar-worker
   function with `Authorization: Bearer <Vault secret>`. Do not put credentials
   in the cron SQL text. The worker checks its dedicated secret; JWT gateway
   verification is off because callback and worker have their own validation.
   Apply `calendar-worker-schedule.sql`; it calls the worker only when jobs are due.
5. Test real Google and Outlook connections with a temporary host/guest dinner,
   including Google→Outlook and Outlook→Google delivery. Check the calendars,
   the confirmation status, rescheduling and cancellation. Clean up test data.
6. Publish the frontend only after these checks pass.

## Behavior and boundaries

- Checks cover Google's primary and Outlook's default calendar for each connected
  provider. Secondary/shared calendars are not included in this MVP.
- Poll votes are availability only. RSVP approval binds to the exact finalized
  time, duration and destination zone. Rescheduling clears approval and asks again.
- One host event per dinner; provider IDs, Google deterministic event IDs,
  Microsoft transaction IDs and extension lookup prevent duplicate retries.
- Calendar confirmation is separate from restaurant reservation status.
- Background jobs retry delayed delivery. A leased, generation-counted queue
  prevents concurrent workers and preserves edits arriving during sync.
- Confirmed provider responses are read back. External calendar changes are
  flagged rather than silently overwritten. A new explicit Enkai RSVP can resync.
- A guest invitation must match the confirmed start and end before acceptance.
  Delayed reschedule delivery stays pending. Previously verified invitations that
  are removed or have their time changed are flagged without silently recreating them.
- Outlook may remove a declined invitation. A decline is verified from the host's
  received attendee response if the guest event is gone. Changing a removed decline
  to Going/Maybe directs the guest to respond to the original email in Deleted Items,
  then refresh. Enkai does not request mailbox-reading access or invent a second event.
- Refresh checks occur on login, returning to the app, relevant navigation, and
  manual/pull refresh. Fresh results are reused for a minute; drafts are preserved.
- Disconnection deletes the stored refresh credential and pending OAuth states.
  It does not delete existing provider calendar events.
- Email addresses are obtained from authenticated identity/calendar accounts.
  Old sessions without a stored email need a fresh sign-in or calendar connection
  before they can receive calendar email. Manually typed guest names are not email invitations.

## Verification commands

`npx deno check supabase/functions/meal-planner/index.ts supabase/functions/calendar-callback/index.ts supabase/functions/calendar-worker/index.ts`

`npx deno test --allow-env tests/calendar-core.test.ts tests/calendar-sync.test.ts`

SQL checks: `tests/calendar-database.sql` and `tests/mobile-response.sql`, wrapped
with BEGIN/ROLLBACK alongside the migration when checking before installation.

Provider simulations and browser fixtures do not prove live OAuth, real email
delivery, or physical iPhone Safari / Samsung Internet compatibility.

## Setup checkpoint — 2026-11-12 (not a public release)

- Database migration applied after transaction/rollback regression checks passed.
- Calendar callback, worker, and updated planner functions deployed for provider tests.
- Dedicated encryption key and worker credential stored in Supabase; matching
  worker credential in Vault. Minute scheduler installed and active.
- Google Calendar API enabled. Dedicated Enkai Calendar Sync web client created
  and stored in server secrets. Consent scopes declared. Google project remains
  in production with an unverified sensitive scope and a 100-user cap. Google
  verification and a consent demonstration are still required for general rollout.
- Microsoft Enkai Calendar Sync registration created for personal accounts,
  with Web callback and delegated User.Read / Calendars.ReadWrite declarations.
  Its first credential was revoked after it appeared in a diagnostic result.
  A replacement was transferred directly to Supabase without printing its value;
  it expires May 11, 2027. Rotate it before that date to keep connections working.
- Ten provider-simulation/unit tests and database permission/response/linking
  regressions passed. Recovery after a lost creation response reconciles later
  edits without creating another provider event.
- Mobile fixtures checked at 390px and 360px. Fixed a sticky footer that could
  cover Refresh; draft choices now survive refresh without accidental submission.
- Google consent completed for the isolated Google test identity. Real Google
  event creation, conflict detection, self-invitation exclusion, name/date updates,
  refresh without duplicate creation, reschedule reconfirmation, and cancellation
  passed against the live API. The temporary invitation was cancelled and its
  absence was verified in both proposed time slots. This does not prove email
  delivery or guest automatic acceptance, which still require Outlook access.
- Outlook mailbox consent was accepted for the owner's test account. Identity,
  nonce, scope and token-exchange checks passed, but authenticated Microsoft Graph
  `/me`, `/me?$select=id,mail,userPrincipalName`, and `/me/calendar` calls returned
  HTTP 502 (latest Graph error code `UnknownError`). A private, unauthenticated
  network probe from the same Edge runtime returned Graph's expected 401 in 19ms;
  that temporary diagnostic route has been removed. Outlook Web's calendar page
  also displayed an Internet connection error. This does not establish a global
  outage. A fresh retry, including the minimal `/me/calendar?$select=id,owner`
  request, still failed with HTTP 502 / UnknownError on November 12 at
  21:58:31 UTC. Microsoft request ID: `8f3740cb-5c53-47dd-85d5-f43b738a35f4`.
  Only these safe diagnostic values are logged; no token or provider payload is
  logged. Do not mark Outlook connected or publish until a real retry succeeds.
- Microsoft connections now identify the account using the verified ID token
  object/subject ID and obtain the invitation address from the default calendar's
  owner. Provider outages show a retry-later message; voting/RSVP remain available.
- The owner confirmed that the Outlook desktop calendar works normally. Treat the
  failure as an unresolved authenticated Graph path, not a broken mailbox or a
  global outage. HTTP/1.1 and default transport both returned 502. An independent
  US East callback also returned 502 / UnknownError at 2026-11-12 22:47:21 UTC;
  Microsoft request ID `1542064a-d7db-4ceb-9613-443a1563bf01`. The temporary regional
  redirect and transport probes were removed and the normal callback redeployed.
  The owner completed Microsoft Graph Explorer sign-in. Its independent queries
  also failed: `/v1.0/me` returned 502 / UnknownError in 21,032 ms at
  2026-11-12 22:55:51 UTC (request ID `98f2e944-5b1a-4665-8412-b5cedeee4a97`),
  and `/v1.0/me/calendar?$select=id,owner` returned the same error in 21,132 ms at
  22:56:30 UTC (request ID `b7f2313d-c5f5-4a91-bc86-492ce4dc5ccf`). Both error
  messages were empty. This reproduces the failure outside Enkai, using Microsoft's
  own client and the local browser rather than Supabase. The underlying Microsoft
  service/account cause is still unknown; do not describe Outlook as fixed.
  The diagnostic page and screenshots were retained. Microsoft Graph support:
  https://developer.microsoft.com/en-us/graph/support . No support request has
  been sent and no public post containing account details has been made.
- Additional fixture checks passed for responses when a calendar is unavailable
  and organizer destination-time settings. Real browser checks confirmed both
  themes share saved votes and preserve drafts across refresh without submitting.
  Verified mobile dimensions: Supper Club 390 × 844 and After Hours 360 × 800.
  The live cancellation check exposed stale guest email-acceptance text after a
  dinner was cancelled. The shared UI now gives cancellation priority and hides
  the unnecessary connection prompt; the corrected mobile screen was verified.
- Ten simulation/unit tests passed again after the callback adjustment. These
  simulations are not evidence of a successful real Outlook invitation/response.
- The same ten tests now also cover delayed guest event times, externally changed
  times/deleted invitations, outages versus deletion, Outlook's removed decline,
  delayed decline receipt, and the email-restoration path. All passed. Functions
  type-check and shared browser code parses. These backend fixes are deployed for
  provider testing, but the frontend remains unpublished pending the live provider tests.
- Background refresh reprocessed the cancelled Google review event after an old
  job lease expired. The remaining unfinalized review poll job was retired with
  a query limited to the exact review owners and plans without an active provider
  event. Queue count was zero after cleanup. Completion failures now log only a
  safe database error code instead of disappearing in a background catch.
- Frontend remains uncommitted and unpublished. Existing two user dinners were
  unchanged and remain opted out of calendar invitations. Two temporary review
  dinners use isolated identities; the Google-hosted one is cancelled. The Google
  test connection remains encrypted for completing the blocked cross-provider
  tests. It is not yet a connection on the user's ordinary Enkai login. Remove
  the isolated connection and records after testing, before public rollout, so
  that the real account can connect without a mailbox-uniqueness conflict.
