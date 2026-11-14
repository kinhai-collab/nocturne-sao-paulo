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


## Google verification preparation — November 13, 2026

Branding draft saved as Enkai. Automated branding review reports that the
homepage is not registered to the project owner. Google instructs verifying
ownership and waiting 24 hours before retrying the branding check.
Search Console URL-prefix property prepared for the existing GitHub Pages
homepage under kinminghai@gmail.com. Ownership confirmation is pending; no
ownership verification has been claimed successful and no data-access review
has been submitted.

### Calendar scope justification for submission

Enkai helps invited groups choose a dinner time and coordinate attendance.
The optional Google Calendar connection requests openid and email to identify
and address the connected account, plus
https://www.googleapis.com/auth/calendar.events.
It reads event titles and start/end times from the connected primary calendar
to show private conflict warnings beside proposed dinner times. It creates,
updates and cancels dinner events when the organizer enables invitations, and
updates the guest attendee response only after explicit confirmation for the
finalized date, duration and destination time zone. A poll vote is not consent
to accept an invitation. Read-only access cannot create invitations or update
attendee responses; app-created-event-only access cannot read pre-existing
conflicts or respond to organizer invitations on a guest calendar. The app does
not request full calendar configuration, contacts, Gmail, or Drive access.
Conflict details are fetched on demand and not stored in the database.
Refresh credentials are encrypted server-side. Disconnect removes the stored
credential; existing provider events remain. The existing privacy page describes
storage, invitation email sharing, conflict privacy and disconnection.

### Required real demonstration recording

Use only dedicated demo dinner details and consenting test participants.
Record in English, with the consent URL/client ID visible but no secrets or
private calendar details. Show:
1. Public Enkai homepage, privacy link and Google/Outlook sign-in choices.
2. Google sign-in, then Settings > Connect Google Calendar and the real consent
   process. The consent brand must say Enkai after branding is approved/published.
3. A proposed dinner time overlapping a harmless demo calendar event; open its
   conflict warning and show that another guest cannot see those details.
4. Organizer enables invitations for a finalized dinner; show the created Google
   Calendar event with destination time, location and invited demo participant.
5. Guest explicitly confirms attendance and calendar response; show the actual
   accepted invitation in their calendar. Do not label simulations as live proof.
6. Reschedule and explicit reconfirmation, cancellation, and Disconnect in Settings.
Upload the real recording as an unlisted YouTube video and supply its link in
Google's verification form. No recording or upload has been completed yet.

Before submitting, ensure the planner homepage has a visible privacy-policy link,
the consent homepage describes the meal-planning/calendar feature, all requested
scopes are declared, and the privacy page has a direct support/deletion contact.
Google, not Enkai, makes the final verification decision.


## November 13 follow-up

Google Search Console confirmed “Ownership auto verified” using the HTML file
for https://kinhai-collab.github.io/nocturne-sao-paulo/ under kinminghai@gmail.com.
Both the existing uploaded HTML proof and the added homepage meta tag are retained.
The branding checker requires waiting 24 hours after ownership verification before
retrying. Calendar scope justification and real-demo storyboard are prepared above;
no final data-access submission or approval has occurred. The public privacy page
now includes a direct support/deletion contact, Google Limited Use disclosure, and
links from the meal planner and restaurant homepage. A fresh Google connection
again encountered the unverified-app warning, which requires the user to complete
it; no warning was bypassed and no demonstration video was fabricated.

Outlook retest: a fresh Enkai OAuth connection succeeded, and the actual API
returned checked conflicts. The isolated November 13 Outlook-host dinner was
created, read back as a conflict in a second poll, renamed/rescheduled without a
duplicate, and cancelled; all live checks passed. Microsoft Graph Explorer's
separate automatic sign-in stalled, but Enkai's own consumers sign-in worked.
Both themes' Outlook connection controls are being restored based on those actual
checks. Real cross-provider invitation acceptance remains unverified because the
fresh Google test authorization stopped at the warning. Unit/provider simulations
still pass (10 tests); do not describe those as live guest acceptance evidence.
The isolated test Outlook connection is removed after cancellation to allow the
owner's ordinary Enkai account to connect without a mailbox uniqueness conflict.

### UI diagnosis — observed in phone-size browser review

Local fixtures exercise the real UI with simulated sign-in, search and responses;
these are UX checks, not physical iPhone/Samsung or real OAuth/booking tests.
Supper Club restaurant-first planning was reviewed at 390 x 844. After Hours
invitation preview, first-time sign-in, polling, saved response, dashboard and
final RSVP were reviewed at 360 x 800; date-first and undecided entry were also
inspected at 390 x 844. No horizontal overflow was observed on the checked guest
confirmation screen. Fixture restaurant text has encoding artifacts that must not
be reported as defects in live restaurant records.

Priority 1: A guest voting while the date is undecided must select Going/Maybe/
Can't make it before saving dates/restaurants. Saving dates without an attendance
choice is blocked by native validation. The saved poll and dashboard then say
Going despite no final date. Recommend Save availability at poll stage and an
explicit RSVP only for the finalized plan, with stage-specific dashboard labels.

Priority 1: Selecting names in The people step does not send invitations or create
account-bound contacts. The review says Invite: Maya, although only a shared link
is generated. Explanatory text exists but conflicts with that promise. Recommend
Planned guests: Maya, then a dedicated Share invitation confirmation with clear
Not invited / Joined / Responded states and one primary Share action.

Priority 2: Restaurant-first results say Add to poll and immediately return to the
planning form after one selection. The user cannot predict that transition.
Recommend Choose this restaurant for that flow, retaining Add to poll and Added
for multi-choice flows, with a visible choice count and Done (N selected).

Priority 2: Calendar conflicts for finalized dinners appear below the RSVP form
and confirmation button. Move a compact conflict warning above the attendance
choice so users can consider it before confirming. Keep private details collapsed.

Priority 2: Finalize the plan & reservation hides three different jobs in one
collapsed section: choose poll winner, record reservation, send calendar event.
Recommend an organizer next-action card, separate Reservation needed / Booked /
In-person only from Date confirmed and Calendar synced, with a poll summary
showing who has responded and an obvious Choose final date action.

Priority 2: The undecided path opens a large destination-zone selection before a
city is entered; dates are disabled until destination is established. Known city
entry successfully collapses it to Toronto time. Ask city first and show detected
time zone as a short confirmation with Change; show advanced zones on demand.

Priority 3: Multiple Refresh actions (calendar section and responses/calendar)
compete on the detail view. Prefer one refresh control plus last-updated status.
Keep RSVP/calendar connection independent: guests should never need calendar
permission to save their response. New-user copy and destination/current time
explanation worked in the inspected UI and should be retained.


## Availability / final RSVP release

Availability saves without an attendance choice or calendar acceptance. A final
RSVP requires both the restaurant and date; the database strips premature RSVP
fields even from older clients. Final date or restaurant edits require a fresh
RSVP and preserve saved poll choices. Unconfirmed responses are excluded from
attendance counts. Calendar creation waits for both final details.
Organizer guest names are labeled as planning notes, never delivery confirmation;
sharing controls precede the notes and joined/response counts remain separate.
Guest calendar warnings appear above the final RSVP options and confirm button;
calendar connection remains optional and provider errors are not shown as clear.
Both themes share the same implementation.
Validation: transaction/rollback SQL checks for availability, required final RSVP,
stale writes, invalid choices, outsider access, identity linking, restaurant-change
reconfirmation, queue/cancellation/permissions; 11 calendar tests; real planner API
create/join/availability/final RSVP/reconfirmation with calendar invitations off.
The isolated API test plan was cancelled. Phone-size browser UI checks cover guest
invite preview/sign-in (simulated), availability, cross-theme saved choices, final
RSVP, conflicts and optional connection, plus organizer creation/review/share/copy.
These checks are not physical Safari/Samsung tests or a new real OAuth acceptance
verification; the existing Google verification/consent limitations still apply.


## Verification timing checkpoint — November 14, 2026

Ownership success screenshot was saved at 2026-11-14 02:05:12 UTC, corresponding
to November 13, 6:05:12 PM America/Los_Angeles. Google's requested 24-hour wait
therefore ends November 14, 6:05:12 PM Pacific (November 15, 02:05:12 UTC).
At the November 14 00:22 Pacific check, only about 6 hours 17 minutes had elapsed.
Do not claim propagation completed or submit a premature branding recheck.
Live checks confirmed the ownership HTML file/meta tag, privacy disclosure and
planner privacy link remain public. The real demo video is still outstanding.
Browser inventory timed out twice in this attempt, so no new Google Console
status was observed, no submission was made, and no review approval is claimed.


## Personalized sharing release

Shared messages now include the host's first name, restaurant or restaurant poll,
destination time, location and an explicit vote/RSVP action. Copy invitation copies
that text and the link; the native share sheet and WhatsApp receive the same content.
Organizer message preview is available before sharing.
There are 54 crawler-readable restaurant preview pages generated from the existing
verified guide photos. The JPEG encoding is for social-preview compatibility and
does not generate or alter restaurant content. Pages expose only existing public
restaurant information; no dinner records, guest lists or invitation tokens are
exported. No database credential or extra preview-hosting service is required.
Unknown restaurants and undecided restaurant polls use the existing generic
Enkai food preview. Poll previews do not favor a first restaurant candidate.
Opening either route preserves the opaque invitation and chosen theme through
sign-in. Legacy i.html links still work. Incomplete links explain how to recover.
The public guest landing shows the matching guide restaurant photo when available.
After a saved response, guests can optionally Plan your own evening using their
existing session; this starts a separate plan and preserves the original response.
No promotion interrupts voting, no contacts are imported, and no messages are sent
automatically. No new analytics or tracking was introduced.
Validation: five sharing/metadata checks across all 54 pages; phone-size UI flows
in both themes for host message/WhatsApp payload, invitation redirect, simulated
sign-in, RSVP/availability and guest-to-organizer creation; the original RSVP was
preserved after creating another plan. Real WhatsApp app preview rendering is not
verified here and depends on client settings/caching; metadata/assets are checked
separately after publication. Photos for arbitrary live-search restaurants still
require a future photo/preview publishing path; they currently get the honest
representative Enkai image fallback.

## Live-search invitation images

The selected Google Place ID now resolves a fresh photo when an anonymous guest
opens an invitation and when a signed-in organizer/member opens dinner details.
No photo references, image URLs, bytes, website HTML, or provider key are stored
in dinner records, browser storage or the static repository. Google-hosted photos
are requested at 800px and carry Google Maps/author/source credits. When Google
returns no photos, the resolver tries the restaurant website's published Open
Graph/Twitter image. This may be a logo. Website images have their own source
credit and are contained rather than cropped. Missing/blocked images leave Maps
links and never block sign-in, voting or RSVP. Restaurant polls do not favor a
candidate image before the organizer selects a restaurant.

Public photo actions require an existing unguessable invitation. Signed-in photo
actions check organizer/member access. Website lookups use bounded HTTPS reads,
public IPv4 checks per redirect, pinned connections with hostname-verified TLS,
no cookies or keys, and a strict timeout/body limit. The existing global monthly
900-search and 900-photo limits remain separate. Per-dinner photo limits are
30/minute and 150/day so a group can open its invitations together.

Google's live responses omitted photos for the tested restaurants. Google
Console requested billing association; the user explicitly chose to leave
billing unchanged. Do not claim this proves billing is the cause. The restaurant
website fallback was verified live for Richmond Station and Gusto 101; Gusto 101
is outside the curated guide and publishes its logo as its preview image.
Pizzeria Libretto did not yield an image and correctly uses the fallback.

`preview-service` provides dynamic, crawler-readable invitation metadata without
Google/Supabase/GitHub credentials. Humans redirect straight to GitHub Pages with
their invite/theme. Message crawlers request fresh provider/website images. Its
Vercel project is `enkai-invites`, with the root set to `preview-service`. Keep
the frontend config unset until public service verification succeeds. Existing
54 static guide preview links and generic i.html links remain compatible.

The public service `https://enkai-invites.vercel.app/i` is verified live without
Vercel login for both themes: WhatsApp-style crawler requests get personalized
HTML and the current restaurant website image; human requests redirect to the
same invitation/theme on GitHub Pages. `POLL_CONFIG.invitePreviewBase` is enabled.
All 18 focused automated tests passed, along with rolled-back database quota and
access tests. Mobile-size UI checks used actual Gusto 101 website image responses
with simulated sign-in/RSVP: both themes saved responses, including forced photo
failure. No calendar invitation was sent by these tests. Physical phones and the
actual WhatsApp app preview renderer remain untested.

## Food and restaurant photography preference

Website photo selection now reads the bounded HTML body and scores food images
ahead of restaurant interiors/exteriors and neutral hero photography. It skips
labelled branding, navigation/footer images, tiny trackers, loading placeholders
and menu graphics. Lazy-load and responsive sources use the real photo instead
of a blurred placeholder. Google photos prefer usable landscape dimensions over
tiny logo-sized assets. Existing guide photography remains unchanged.
Gusto's old social image explicitly says "Gusto 101 logo"; its actual hero photo
is an overhead spread of dishes and was visually checked in both themes.
The same backend selection serves invitation pages and crawler metadata. Newly
generated live links add `image=food1` to distinguish them from previously cached
chat previews. Previously sent messages can retain WhatsApp's cached preview.
No billing/quota changes, AI image classification, image mirroring, or permanent
photo storage were introduced. Source labels are heuristics, not a guarantee
that every unlabelled image contains no branding.
