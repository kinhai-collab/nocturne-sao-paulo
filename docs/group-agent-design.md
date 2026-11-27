# Enkai group agent: blind personal delegates

## 1. Summary

**Make meals with friends and family easy.** Adding invite-link connections and saved groups is approved; their specific policies remain recommendations awaiting product input. Ship live privacy fixes first, friends and saved groups second, then blind delegates, review and hardening. In the Who step, one tap selects a saved group; a past friend takes 1-2 taps; a first invitation still needs one link-share action. These count invitation setup, not the entire dinner workflow.

**Overriding product requirement, 2026-11-26:**

> Users must not know each other's calendar availability. We want to protect the user's privacy, period. When the agents discuss availability, it's like two agents negotiating a time slot that works, not one agent checking between two calendars and finding something that works. I want both agents to be blind to the other person's calendar, to maximize privacy.

### How blind negotiation works

Each guest's assistant keeps their diary closed, checks public dinner proposals against its owner's private rules, and sends limited encrypted answers. Nobody shares a calendar or free-time list; the organizer has no special access.

When enough assistants approve the same exact plan, including everyone marked required, the organizer reviews it and finalizes the dinner. People see the agreed plan and simple progress messages. They do not see who rejected a time or how many people liked each option.

Fewer proposals disclose less but can miss workable times. Offline assistants cannot approve. Encryption hides answers from Enkai's relay, but endpoint inspection can reveal permitted answers. Neither perfect secrecy nor a match is guaranteed.

Use **one delegate per person**, reading only its owner's calendar/private rules and permitted session messages. No shared runtime, storage, logs, analytics or LLM receives multiple owners' calendars, free/busy, private windows or reconstructable availability aggregates. Removing titles is insufficient. No central intersection or availability snapshots exist.

The service authenticates, relays ciphertext, enforces limits and records agreement. A rotating delegate proposes without privileged access. Humans see final agreement and minimal progress, never peers' ballots, reasons, per-time counts or leaders.

**Privacy boundary:** final agreement necessarily reveals willingness to attend that slot; rejection can reveal a compatibility bit. Neither proves calendar occupancy. The recommended protocol bounds disclosure and encrypts it from the relay. It cannot guarantee zero inference against colluding participants, outside knowledge, compromised endpoints or an operator replacing browser code. These limits require product acceptance, not a claim of perfect secrecy (section 12).

### MVP at a glance

The MVP serves dinners of 2-12 people: phase 1 closes privacy leaks, phase 2 adds friends and saved groups, and phase 3 onward adds blind delegates. Saved groups seed separate dinner rosters. Guests sign in and claim their place; required people and quorum approve the exact plan before manual organizer finalization. Recommend **on-device deterministic delegates and end-to-end encryption (E2EE)** with manual private constraints first. Local calendars follow proven device-only credential custody. No LLM, autonomous booking or shared calendar reads belong here.

The recommended protocol allows three rounds, each proposing three candidates under a public rule. Each person sends one batch compatibility bit and one exact candidate answer per round, with at most one coarse counter for the entire budget period. A conservative ten-bit content budget limits calendar-dependent answers per person per target calendar week across all sessions. People see “Negotiating”, “No slot yet”, “Action needed on your device”, or final agreement. Expiry never means acceptance.

**New shared storage** holds connections, private saved groups, per-dinner rosters, keys, sessions, expiring encrypted envelopes, budgets, minimal lifecycle records and final agreements. Constraints, grants, credentials, caches, transcripts and the leakage ledger stay **on the owner's device**. There are no central availability tables. Including friends and groups, estimate **11-17 developer-weeks and 56-110 hours of Codex-plus-reviewer loops**, or **14-22 weeks and 72-140 loop hours** with one local calendar integration. Loop time is not total delivery time; see the phases section.

This is design only. No application behavior, SQL, migration, deployment or calendar authorization changes are made here.

## 2. Current state and conflicts with shipped UI

Evidence is checked-in source, including all 15 `supabase/migrations/*` files, not inspected deployment state. The application is a host-managed poll, not blind negotiation.

`meal_plans` stores dinner JSON/version/invite; `meal_plan_members` stores provider-derived account strings, names and response JSON. `supabase/functions/meal-planner/index.ts` verifies Google/Microsoft or remembered sessions, then uses service-role RPCs. `canonicalAccount()` and `meal_microsoft_links` reconcile identities; current accounts are not established `auth.users` UUIDs. There are no delegate principals, keys or dimension-specific approvals.

`planner.js` loads `state.people` from device `localStorage`; `peopleForm()` edits names and `newContacts` merges them after creation (around line 1051). Dinner `guests` and `attending` are name lists, not account bindings. Settings' Planning card opens Saved guests; `planner-mobile.js` supplies the wizard's Who step and `invitationLanding()`. `finishSignIn()` in `planner.js` calls `join` with the invite UUID. The base SQL upserts `(meal_id, account)` without requiring a response or proving attendance. Neither `group-finder.js` nor `invitation-sharing.js` implements a social graph.

RPC chain: `meal_planner_action` → `meal_planner_before_calendar` → `meal_planner_rsvp_action` → `meal_planner_suggestions_action` → `meal_planner_base_action`, with operation-specific interception. Latest outer definition: `202611260001_cancelled_dinner_guard.sql`. It locks/rejects cancelled dinners for `respond`, `rsvp`, `manage`, `vote`, `suggest`; `join` is outside that guard. `respond` checks plan version; legacy `vote` does not. Availability precedes RSVP; edits invalidate schedule confirmation/calendar replies.

### Conflicts with shipped UI

Today the organizer sees who picked which times through `pollTallies` and the People & responses list, “leads · 3 of 4 can make it” hints and tie messages, and vote counts in finalize selects and home cards; the list RPC also sends everyone's time answers to the organizer's browser.

Phase 1 (privacy closure) can ship independently of the agent and is recommended first.

**Nothing listed below is changed now.** Hiding markup cannot fix answers already delivered to browsers.

| Source / function | Current disclosure or boundary | Future change |
| --- | --- | --- |
| `202611100001_meal_planner.sql`, base `list` | Returns `p.details`, own `myVote`, `joinedCount`, full named `responses[].vote` including `times` to organizer; guests get `responses: []`. | Remove peers' time answers for every caller, including host/service tools. Explicit allowlisted projection, not broad details merging. New own time answers stay local. |
| `202611100003_meal_suggestions.sql`, `202611110001_meal_rsvp.sql`, `202611140001_availability_before_rsvp.sql`, `202611260001_cancelled_dinner_guard.sql`, `list` wrappers | Enrich rather than strip base data. Latest list adds named final `attendanceResponses`, `calendarSync`, requester-only `myCalendar`. | Sanitize composed result: no legacy votes, named negative RSVPs, reconfirmation history or others' provider details. Final attendance decision below. |
| `supabase/functions/meal-planner/index.ts`, handler | Accepts up to ten `vote.times`, stores through RPC, returns RPC data without privacy shaping; `manage` adds/selects times. | Stop plaintext time ballots, not merely read exposure. Reject legacy time mutations/bypass finalization. New ciphertext relay cannot reuse `respond` as answer storage. |
| `dinner-state.js`, `derive()`, internal `leadHint()` | Time counts/names, `noneCounts`, `leadingTime`, `tiedTimes`, `otherResponseCount`; hints like “Sat, Dec 5 leads · 3 of 4 can make it”; ties name times/counts. | Remove time counts/leaders/ties and participation hints. Hidden data is not zero votes. Keep pure state pattern. |
| `planner.js`, `pollTallies()` | Organizer time counts, proportional bars, voter names, none counts and accessible labels. | Remove entire time dimension, including ARIA text. Restaurant-only display is separately scoped. |
| `planner.js`, `mealDetails()`, `updateTimeInputs()`, `dinnerNext()`, `dinnerNextMarkup()` | Select labels include vote totals; hints expose leads/ties; leader preselection; People & responses lists named time choices; share card counts saved responses. | Coarse state/final-slot controls; remove named time lists, totals and leader selection. Claims remain identity administration without answer status. |
| `planner.js`, `card()`, `dashboard()`, `attendingGuests()` | Home cards show option counts, availability-response and going/maybe counts, joins; final details list named attendance. Card uses action label; detail renders lead hint. | No candidate/answer counts, maybe/declined lists. Coarse state, own action, final slot. Joins only in roster administration. Limit final attendance per section 7. |
| `planner-mobile.js`, `responseForm()`, `noneChoice()`, `validatePollResponse()`, `receiptView()`, draft helpers | Select-all/none time ballots feed host-visible response; own receipt says host can see choices; session-storage drafts retain them. | Owner-local delegate setup/private confirmation instead of time-ballot upload. Own receipt stays local; correct copy and clear/version drafts on logout/account switch. |
| `planner-calendar.js`, `calendarPollChoices()`, `paintCalendarChecks()`, `checkDinnerCalendar()` | Current user's manual overlaps and title/start/end/provider/tentative conflicts or checked-clear notes, cached in browser. **Not currently peers' conflicts.** | Owner-only local view, no shared telemetry; replace server API. Titles unnecessary for scheduling. Never copy notes into messages/previews/models. |
| `_shared/calendar.ts`, `checkConflicts()`, `eventsInRange()`, `accessToken()`; `_shared/calendar-core.ts`, normalizers | Shared runtime decrypts many users' refresh tokens and reads event titles/times. `calendarAction()` scopes requests to actor; operator/runtime remains shared. | Move reads/tokens to device; owner-scoped HTTP/RLS is insufficient. No shared sanitizer receiving everyone's events. |
| `planner-calendar.js`, `calendarDinnerMarkup()`; `_shared/calendar.ts`, `syncDinner()`; `calendar-core.ts`, `eventPayload()` | Own reply status is in-app private, host connection status shared. Provider events expose attendee emails and accepted/tentative/declined replies. Sync loads multiple users' connections; guest emails included independently of acceptance. | Disable shared sync for privacy scheduling. Recommend private owner-created entries without attendee lists. Shared invitations/reply tracking require explicit separate disclosure policy. |
| `group-finder.js`, `openGroupFinder()`, `saveGroupShortlist()` | Organizer sees selected time and opens restaurant poll; no group calendar search. Copies meal into `manage` after removing some server fields. | Use final agreed time, or explicitly public area/cuisine without time. Never round-trip negotiation/transcript fields through meal JSON. Keep booking disclaimer. |
| `invitation-sharing.js`, `text()`, `title()`, `url()` | Shared text includes time-option count, selected date/zone, area/restaurants; URL has opaque code/theme and preview version/image. Selected time need not be agreed. | Drop time-option counts/vote language. Only authorized viewers get final time. Preserve opaque links; no availability parameters or per-message preview version changes. |
| `planner-mobile.js`, `invitationLanding()`; meal-planner public `preview` | Link holders get title/location/restaurant/selectedTime/zone/duration/cancellation/photo flag/first host name; no votes/roster. Says host sees response. | Generic pre-auth invitation/venue imagery, no time. Final slot participant-only unless link disclosure explicitly approved. Correct copy. |
| `preview-service/core.mjs`, `invitationResponse()`/`invitationTarget()`; `api/invite.mjs`; `vercel.json`; `invite.js` | Crawlers get selected time in Open Graph description; humans redirect to invite hash. Chat caches can outlive no-store. `invite.js` redirects codes and has static sample voting, not live answers. | Remove scheduling metadata and sample calendar-voting promises; keep redirects/code format. Previews never decrypt envelopes. Existing cached cards cannot be recalled. |
| `planner.js`, `save()`, `busyForm()`, `hasConflict()`, `downloadCalendar()` | Busy blocks/people/wishes are device-local; ICS exports selected dinner. Shared-device/XSS/forwarding risks remain. | Owner-reviewed, zone-aware local import; account isolation/cache clearing; export final agreement only. Device-local is not automatically account-private. |
| `docs/ui-quick-wins.md`, items 3/4/8, compatibility notes | Specifies host names/counts, lead/tie messages, own conflict notes and response-count sharing; records no shared negotiation. | This design supersedes time-vote UX. Keep primary-action, busy-state, cancellation and zone behavior. File unchanged now. |

**Restaurant votes:** preferences alone are not calendar data. Recommend retaining standalone restaurant aggregates with consent and voter names hidden by default; product decision required. A restaurant linked to a candidate time is a scheduling answer and gets identical protection. Dietary/location data can also be sensitive. Dining-guide ballots/counts/initials in the three `20261013...` migrations are separate from dinner membership/time negotiation.

## 3. Friends and saved groups

### Ease of setup

People joining dinner links become reusable connections. A host saves sets such as Family or Book club to reduce typing and sharing, without calendar access. Inclusion is **DECIDED**; policies remain **NEEDS PRODUCT OWNER INPUT** in decisions 21-29.

| Target flow | Happy-path actions once signed in |
| --- | --- |
| Invite a saved group | One tap in Who adds its roster and targets eligible connections when the plan is created. Review and creation remain separate. |
| Re-invite a past friend | 1-2 taps to select them from friends or recent connections. No account lookup or retyping. |
| Invite someone new | One share action for the dinner link. The guest signs in and joins; no separate friend request. |

Targeting means an invitation appears in the recipient's own Enkai invitation list, separate from joined dinners. It sends no email, push or message and grants no participant access. Share remains available for people who have not opened Enkai. Adding manual names sends nothing.

### Dinner connections and minimal identity

Recommend **host–guest only**, automatically on a successful authenticated link join after clear disclosure. A join proves joining, not attendance. Do not connect all attendees: that would tell guest A that B joined the same dinner and reveal B's identity, even when they are strangers. No connection is created on preview, failed join, cancelled dinner, self-join or mere targeting. Repeated joins are idempotent.

Both people see and can remove the connection. Use a quiet “You and Ana are now dinner connections” receipt, without notifications. Neither gains access to the other's list or history. Explain host name disclosure and participant roster visibility before joining.

| State | Meaning and transition |
| --- | --- |
| Pending | An optional historical suggestion or a future consent request; not selectable as an active connection. |
| Active | Eligible for repeat invitation after the disclosed join. Store separate endpoint acknowledgements and a creation policy version; automatic connection is not mutual friendship consent. |
| Removed | Either endpoint ends the connection for both. Hide it from both lists; repeated link joins do not silently restore it. Explicit consent from both can reactivate it. |
| Blocked | Effective state while either directional block exists. Never returned as a peer-visible reason. Unblocking leaves the connection removed. |

Display name only. The verified account string resolved by `canonicalAccount()` stays hidden: Google's subject, or Microsoft's linked Google subject or `microsoft:` subject. Spoofable names never authorize, merge or bind claims. Account linking atomically re-keys records, deduplicates pairs/memberships, preserves removals and applies stricter blocks without revealing aliases.

### Saved groups and the dinner roster

Recommend private, creator-owned groups with **up to 11 other people**, fitting this design's 12-person dinner cap with the owner. Only active connections can be added. Each has a `required_default`, initially false; the organizer remains required. One tap expands account-targeted placeholders. Overlaps deduplicate by canonical identity; required wins conflicting defaults. Manual names remain unverified. Stop over-cap selections for editing; never silently drop required people or change N.

Creation copies this selection into the dinner's own versioned roster. Invitees still join, self-claim and, later, set up their delegates; a targeted identity restricts its claim to that account but does not auto-claim or accept. Required claims retain organizer confirmation. Freeze N and required flags under decision 2; missing invitees do not count toward quorum. Group edits affect future invitations only. Before delegates ship, the same picker supplies invitation placeholders without pretending blind agreement exists.

Members see **nothing about private group membership by default**, including the title or other names. They receive only “Ana invited you”, not “Book club invited you”. Recommend no sharing in MVP. If sharing is later enabled, only explicitly consenting members' names may be shown to authenticated approved viewers; no account strings, attendance or scheduling status. Consent withdrawal removes a name from that shared view; group size or hidden-name counts must not expose nonconsenters. Sharing never grants editing or invitation authority.

A private list is a host's address list, not an enrolled community. Provide “Stop inclusion in Ana's saved groups” from the connection screen without revealing which lists contain the person. It removes their entries from all Ana-owned lists and records an exclusion; Ana cannot re-add them without their consent. A shared group has a visible Leave action with the same no-readd rule for that group. Removing a member affects future plans only; deleting a group deletes its memberships and sharing grants, not connections or dinners. Recommend **no ownership transfer in MVP**: the owner deletes or recreates it. Any later transfer needs recipient acceptance and renewed member consent because it exposes a private list to a new owner; never auto-transfer on account deletion.

The participant roster consists of people who actually join and, in the agent phase, authorize their own delegates. Only participants see names and claims in that dinner; nobody receives the saved list's unjoined identities. The host sees its own invitation administration. Connections and saved groups store **no calendars, availability, private windows or constraints**. Membership grants no calendar access or acceptance authority. Group required defaults only seed the organizer's flags; they are not member consent.

### Remove, block, leave and report

Removing a connection clears bilateral selection and their entries in each other's owned groups. Each sees the person disappear, without a removal notification or reason. Other owners' lists are not exposed. A removed person may still use a valid dinner link; reconnecting needs explicit bilateral consent. Past dinner facts remain subject to dinner access and retention, never a social history feed.

Recommend blocks enforced in **both directions** for new targeting, connection creation and joins through either party's host links. A blocked caller gets the same “This invitation is unavailable” outcome as an invalid or closed invitation, including status/body shape; previews stay generic for everyone. Do not reveal who blocked whom. Exclude the pair from group-derived targets and prevent new co-membership in third-party dinners when the other person is already a participant or target. Return only a generic selection failure, without naming the rejected person or pair. A blocked person's alternative account or an externally forwarded message cannot be reliably prevented.

A block removes their entries in each other's groups and suppresses future co-targeting in other owners' groups without disclosing those lists. Historical dinners are not rewritten and known names cannot be erased. For a shared active negotiation, invalidate outstanding authority and pause for generic roster review; never silently remove a required participant or lower quorum. Existing final plans remain historical facts, with no fresh targeting or social access. The blocker may leave an existing dinner through its normal versioned withdrawal rules. Blocking alone is not retroactive erasure or automatic cancellation.

Remove, block, stop-inclusion/leave and report must be available without contacting the host. Reports contain a reason code and optional short text, with an optional relevant dinner/connection reference. Warn against including calendar details; restrict evidence to the reporter and abuse reviewers, rate-limit reports, permit blocking immediately and offer review of restrictions. Never expose reporter identity or report status to the reported account. **Blocking and abuse controls MUST ship before any profile, discovery or offer feature.**

### Proposed new records and access

These are design tables, not migrations. Negotiation `groups` and `group_members` remain **per-dinner implicit groups**. `saved_groups` seeds their roster; it is never the same group or an ongoing authority grant. All new tables enable RLS, revoke browser/anonymous access and permit only narrow service-role commands, like today's planner. Since service role bypasses RLS, command checks are the actual authorization boundary.

| New table | Key columns and keys | RLS and privacy intent |
| --- | --- | --- |
| `dinner_connections` | `id` UUID PK; ordered canonical `account_a`, `account_b` UNIQUE; state; per-endpoint acknowledgement times; policy version; timestamps | Only endpoints list their own active pair; pending suggestions only to their recipient. Never return peer lists or block state. |
| `dinner_connection_events` | `id` PK; connection FK; optional source meal FK; kind; minimal creation/consent timestamp; UNIQUE connection/source/kind | Minimal provenance of the join, not attendance. No response JSON. Do not expose the meal to someone without dinner access; clear source on dinner deletion. Delete expired suggestions/provenance after 90 days; active pair does not depend on it. |
| `saved_groups` | `id` PK; `owner_account`; title; private sharing mode; version; timestamps | Creator only by default. Explicit sharing grants allow only consent-filtered names. |
| `saved_group_members` | `(saved_group_id, member_account)` PK/FKs; connection FK; `required_default`; name-sharing consent version/time | Owner edits; member can revoke inclusion without learning private lists. No inherited dinner permissions. |
| `saved_group_exclusions` | `(owner_account, member_account, scope)` UNIQUE; optional group FK; revocation time | Enforce stop-inclusion/leave even after membership deletion. Never list another owner's groups. Retain until member reverses or relevant owner/group is deleted. |
| `saved_group_shares` | `(group_id, viewer_account)` PK; owner-authorized grant/version/expiry | Reserved for explicit sharing, empty in MVP. Neither an opaque URL nor group membership authorizes a read. |
| `dinner_invitation_targets` | `(meal_id, target_account)` PK; host account; placeholder ID; state; expiry | Host administers its targets; recipient sees only its own invitation. No group title, peers or delegate authority. Expire at dinner closure; remove on block. |
| `dinner_blocks` | `(blocker_account, blocked_account)` PK; timestamp | Only blocker manages its own blocks; internal checks consider both directions. Never disclose reverse blocks. |
| `dinner_abuse_reports` | `id` PK; reporter; subject account; optional meal/connection reference; reason; bounded text; status/time | Reporter gets own receipt; restricted abuse reviewers handle cases. Proposed retention 90 days after closure, with documented limited holds. No availability evidence. |

Commands derive the actor from verified credentials or a verified remembered session and resolve canonical identity; never trust a payload account. Under a transaction, check block/exclusion state, dinner validity and identity before joining, creating a connection or copying targets. Enforce these rules on all mutation paths, including legacy `join`, retries and account linking. Social lists use separate allowlisted responses; never enrich meal `list` or broad `details` with connection/group records. Delete groups/members on owner deletion; keep only the minimum block/abuse records for a documented retention purpose.

### Leakage review

`list-connections` returns only the caller's own connections, with display names and opaque relationship handles. No arbitrary account search, other people's groups, shared-contact counts or block reasons. Group invitations reveal only the host until the recipient joins and accepts participant-name visibility. Keep previews, share text and codes free of group identity and roster data; `group-finder.js` remains restaurant search, not people discovery.

Use neutral outcomes for forbidden, missing and blocked resources, bounded pagination and comparable response timing. No enumeration by invite code, name, email or phone. Proposed limits: 20 new pair creations and 50 target additions per account/day, 10 join attempts/minute per account plus coarse IP abuse limits; repeated joins never consume another connection creation. Bound group edits and apply server-side limits as well as UI caps. Generic failures still allow inference from outside knowledge; do not promise block secrecy against repeated real-world observation. No social data in analytics, previews or calendar provider calls.

### Migration and minimal UI

| Past-dinner option | Consent and usability |
| --- | --- |
| A. Silent backfill | Easy but creates unexpected relationships and treats an old join as new consent. Reject. |
| B. Optional suggestions | **Recommend.** From `meal_plans.owner` and canonical `meal_plan_members.account`, suggest host–guest pairs only. Each sees only people from their own prior dinners; require both to confirm before activation. No notifications. |
| C. New joins only | Least historical processing but loses repeat-invite convenience. Keep as fallback for people declining suggestions. |

Backfill never uses response/attendance JSON or creates attendee-to-attendee edges. Exclude self-pairs, removed/blocked accounts and opted-out history; expire suggestions after 90 days. Existing invite UUIDs and 22-character links keep working. New joins through old links use the disclosed new policy, with an explicit join confirmation for already signed-in visitors; no silent connection creation just from navigating a hash. Current `finishSignIn()` auto-join must respect that boundary.

Offer a separate device-local import of `state.people` as optional name suggestions. Keep them local until the host chooses an existing real connection to match. Never auto-bind names, `guests`, `attending` or wish-interest names to accounts. Dismissal keeps current name-only planning usable; shared-device names must not silently attach to whoever signs in next.

Keep UI changes small: add **From friends and groups** above manual names in Who; replace Saved guests within Settings' Planning card with **Friends & groups** and accurate account-storage copy. Provide a connection list with remove/block/report and stop-inclusion, a group editor, and share/leave controls only when applicable. The join landing states “By joining, you and Ana become dinner connections. Either of you can remove this any time.” Show a quiet post-join receipt, not an alert campaign. The home dinner card is unaffected by this slice; phase 1's privacy corrections still apply. Invitation lists stay separate from joined dinners.

### Effort and future-compatibility note

Estimate **2-3 developer-weeks**, including permissions, abuse handling and review. Four sub-slices (identity/join, groups/targets, blocking/privacy, import/UI) each take roughly 0.5-0.75 week and 2.5-5 hours of Codex-plus-reviewer loops: **10-20 wall-clock loop hours** total. Assume 5-6 minute Codex runs and 2-4 review rounds per sub-slice, plus human review and verification. Depth, findings and reviewer availability can substantially extend elapsed time; this is not a delivery promise.

Future-compatibility note: separate endpoint consent allows mutual opt-in later without replacing connection identity. Blocking and abuse controls come first. Photos, profiles, messaging, and restaurant-interest or dating-like offers are far future, out of scope and not designed here. Phone/email address-book matching is also later, not MVP: it can reveal who uses Enkai, uploads contact hashes that may be guessable, and needs explicit uploader consent, protections for nonusers, opt-out and deletion.

## 4. Trust boundaries, storage and execution

### Where delegates run

| Placement | Benefits | Costs / actual trust |
| --- | --- | --- |
| Browser / native iOS | Data remains with owner; no shared calendar decryption key. Native secure storage strengthens credential custody. | Browser suspension/offline people delay rounds; iOS background execution limited. Bounded reads reduce battery. XSS/extensions or malicious operator-delivered JavaScript can steal data; native releases also require supply-chain trust. |
| Conventional per-user server/container | Always-on, simpler OAuth, low coordination latency. | RLS/process isolation protects users from peers, not administrators/host/debug/backups. Operator can technically inspect memory/tokens or alter code. **Fails requirement.** |
| Per-user attested sandbox/enclave | Offline negotiation with encrypted owner storage and verifiable measured code can reduce operator access. | Needs attestation, owner-controlled key release, rollback protection, isolated observability, patching/side-channel analysis. Ordinary “sandbox” is not this boundary; higher cost. |
| Hybrid progression | Manual-local now, native connector next, optional attested delegates later. | Same protocol/limits throughout; no silent server fallback reading calendars. |

**Recommend an on-device MVP:** start with manual private inputs in the browser, then add one verified local connector, preferably native iOS. Delegates operate while the owner has the app open; offline means unknown, never rejection or acceptance. Bound calendar reads and use 15-minute scheduling ticks while active, without always-on polling. Reminders remain manually sent drafts.

Today `refresh_cipher` uses shared `CALENDAR_ENCRYPTION_KEY`; `accessToken()` decrypts server-side. Callback storage, rotation, conflicts and sync permit operator access. Local credentials need native secure storage or memory-only short-lived browser tokens without a secret-bearing proxy. Identity sign-in stays separate. Unverified provider support requires manual fallback; server connections cannot be promised reusable.

Select calendars explicitly and verify they belong to the owner; consent is session/horizon-bounded and revocable. Reuse the intent of existing overlap/all-day/DST handling and own-dinner exclusion locally, but treat partial pagination, unsupported sources and provider failure as unknown. Never use another member's token or provider free/busy lookup. Source calendar providers necessarily hold their customers' calendars; they are owner-selected sources, not an Enkai negotiation coordinator. Enkai must never send them another participant's private inputs.

One active owner per delegate/device profile: account switching purges old raw caches before another owner's calendar can be read; never combine accounts in one vault or background task. Browser profiles with shared origin access are a weaker isolation boundary than native owner-scoped storage. MVP must not support simultaneous different-person delegates in one browser profile; owner-device compromise remains a stated limit.

Full-product privacy requires revoking legacy broad grants and retiring shared read/sync workers **globally**. Verify provider revocation and backup expiry; deleting ciphertext is insufficient. Shipped disclosures cannot be undone.

### Proposed storage, not schema implementation

| Location / conceptual record | Allowed contents and lifetime |
| --- | --- |
| Shared `groups`, `group_members`, delegate key bindings | Per-dinner group, frozen roster/required flags, canonical identities, claims/key epochs. Seeded by section 3's distinct `saved_groups`; no availability or inherited authority. |
| Shared `negotiation_sessions` | Meal link, public dinner envelope/duration/zone, policy/roster version, seed, round/deadline, coarse state. No private windows, response vectors or scores. |
| Shared `negotiation_envelopes` | Routing, opaque ID, fixed-size ciphertext/expiry. Type encrypted. Delete on delivery acknowledgement, hard TTL 24 hours; no body logs/replay archive/backups. Redelivery is same valid answer, not another query. |
| Shared budgets / receipts | Canonical owner, public target week, charged query/counter permits, opaque nonce/expiry/minimal outcome; no answer/body hash. Week plus 30 days for anti-replay/abuse. |
| Shared `negotiation_events` | Creation/cancel/finalize, policy/key epochs; no intermediate answers, candidate outcomes or private reasons. Proposed retention 90 days. |
| Shared final agreement | Exact final plan/version, required/quorum certificate, conditional-attendance consent. Positive signatures reveal this commitment, not calendar. Approval evidence: dinner plus 30 days; final dinner remains until deletion. |
| Owner-local vault | Own constraints/windows, calendars/grants/tokens/cache. Cache valid 15 minutes, memory-only, purge on expiry/revoke/logout. Constraints expire dinner plus 30 days; no plaintext cloud backup. |
| Owner-local transcript / ledger | Encrypted permitted messages/own answers/replay state. Purge superseded peer answers at round close or 24 hours, whichever first. Keep answer-free budget ledger through target week plus 30 days. No time-vote profile. |

Former central constraints/availability-snapshot tables are removed. Consent authorizes the **owner's delegate**, never an evaluator. Shared grant receipt may identify signing scope/policy, never connected calendars, coverage/windows/read timestamps. Envelopes are transient transport, not analytics. Deletion includes dead-letter queues, replicas, traces and crash dumps. Durable envelope backups are disallowed unless per-envelope cryptographic erasure meets TTL. Peers can copy plaintext; deletion cannot revoke knowledge.

Local constraints retain useful structure: recurring/date-specific windows with IANA zone and explicit DST occurrence, hard/soft limits, budget/currency/tax assumptions, dietary/allergen needs, coarse departure area/travel mode and maximum journey, cuisine preferences. Exact locations and private explanations stay local. Unknown prices, travel or allergy suitability remain unknown, requiring private owner confirmation. Never infer medical facts. Venue search uses only explicitly public area/cuisine inputs; a delegate cannot turn private constraints into a revealing shared search query. Group administrators cannot read or amend owner vaults.

Minimum necessary retention overrides the table's hard caps: delete an exact-answer envelope at signature expiry (five minutes), acknowledgement or session termination, whichever first. Delegates erase failed exact-slot answers when that test closes; only current unexpired signatures needed for a final certificate survive. Erase batch replies/counters when the round no longer needs them; retain only answer-free budget charges. The 24-hour limit primarily bounds offline transport of still-valid control/proposal messages, not retention of expired per-slot answers. No negative answer is required in a durable finalization audit.

### E2EE and privacy-preserving computation

Use established, reviewed authenticated encryption/key management, not bespoke cryptography. Bind identity, roster/epoch, proposal digest, sequence/expiry to messages. Independently checked fingerprints or verified binding authenticate device keys; server directory alone permits substitution. Rekey on membership/device changes, no server escrow. Lost devices require owner-mediated re-enrollment and pending-authority invalidation. Forward secrecy limits later compromise.

| Approach | MVP assessment |
| --- | --- |
| E2EE relay | **Recommend.** Hides intermediate semantics from relay/database readers. Adds verification, device recovery, padding/review costs. Relay still sees routing/activity/size/timing/session and final certificate. It relays every accept/reject ciphertext, without labeling/decrypting the type. |
| Private set intersection | Ordinary PSI can reveal all common times; repeated subset queries still probe. Multi-party/quorum/malicious-query handling is additional work. Defer; revealing all intersections conflicts with minimization. |
| MPC | Could release one qualifying slot/certificate without individual answers even to peers. Requires reviewed malicious-secure protocol, authenticated inputs, collusion threshold/dropout handling. Outputs still leak. Defer unless product rejects bounded delegate disclosures. |
| Homomorphic encryption | Can hide inputs in computations; quorum/selection/key custody/output release still need a protocol, often threshold decryption/MPC. Complexity/review unjustified for MVP. |
| TEEs / confidential computing | Possible later always-on delegates. Separate attested owner environments only, never one common enclave collecting calendars. Trust hardware/attestation/code delivery; rollback/side channels remain. |

These assessments do not verify providers or libraries. Recommend **no LLM in MVP**. Later local parsing uses only its owner's input. No cloud calendar, transcript or private-constraint prompts, including across requests.

## 5. Negotiation protocol and disclosure limits

A public dinner envelope expresses the invitation, not anyone's free time: destination zone, maximum seven-day horizon, broad meeting hours, duration, venues and frozen roster. An organizer's personal window stays local. Stable joint-plan digests cover exact time, duration, IANA zone/DST occurrence, venue and policy/roster version.

**Recommended MVP protocol (pending product input):**

1. Freeze N, required people and policy. Guests pick their placeholder within **Set up my delegate**, sign in and authorize bounded conditional exact-plan acceptance. Optional claims bind immediately; required claims need organizer confirmation. Organizer sees claims/undo/disputes, not scheduling answers. One canonical account per slot; unbound required people block agreement. Constraints/grants never accompany claims.
2. Commit a public seed and candidate-generation rule. A rotating delegate publishes **three** plans per round from a 30-minute grid inside the public envelope, independent of its private calendar. Every delegate independently recomputes the seeded candidate set, order and designated exact test, including any permitted counter inputs, and rejects and flags a proposal that differs from the rule. The proposer cannot smuggle in its own free times or target a particular person with a chosen probe. Venue choices and evidence are public; unknown hard suitability needs owner confirmation. No private preference score leaves a delegate.
3. At a fixed tick, each active delegate evaluates the whole batch locally and emits **BATCH_ACCEPT** (“one or more acceptable”) or **BATCH_REJECT** (“none acceptable or not authorized/known”). No subset, reason or source status. Encrypted messages reach participant delegates, not human views. Positive batch replies do not establish a common slot.
4. Test **one** designated candidate from that batch, using a public deterministic index independent of private answers. Each delegate signs exact-plan **ACCEPT** or sends undifferentiated **REJECT**. ACCEPT authorizes conditional attendance, not booking/calendar writing. Missing replies stay unknown. Owners may privately require confirmation before signing; other humans see no confirmation state. Free/busy alone is never willingness.
5. Each delegate has **one fixed COUNTER phase for the entire budget period**, immediately after its first charged exact test: one of four predeclared broad subranges, or no counter. Sending no counter spends the permit; the owner cannot defer to another round/session, which would encode extra information through timing. Each range contains at least six candidate starts; disable counters if the envelope cannot support four such coarse regions. Meaning: “try this search region”, never “I am free throughout it”. Remaining candidates follow the seeded rule with these encrypted, delegate-shared hints as inputs; no secret ranked list, exact private counter or free text. Every recipient of resulting proposals already receives the counter, so deterministic expansion adds no new private choice. Counter influence is accounted for rather than hidden in ordering.
6. A participant delegate assembles required-plus-quorum exact-version signatures. This endpoint processes allowed messages, not calendars. Batch replies never substitute for exact approval. Organizer privately reviews/approves the exact plan; the relay then verifies final signatures and atomically publishes agreement. No partial certificate or failed-candidate count reaches humans/server. Signatures expire after five minutes and require owner-local checks within those five minutes. Unknown/stale coverage requires private manual confirmation. If terminal freshness/withdrawal fails, stop; no refresh oracle.
7. Three rounds or deadline end with “No slot yet”. Default deadline: 48 hours, at least 24 hours before dinner; shorter notice explicit. No time runoff, winning tally, ranked coverage or named veto. Extensions/reopens/roster edits never replenish budgets. Owners may change public invitation, privately amend their limits, or abandon; nobody waives another's constraint. A feasible slot may remain undiscovered.

Required people must accept; optional nonapprovers are neither counted nor going. Whether optional private vetoes should block the entire dinner, as previously implied, is a changed decision in section 12. No silent N/required-flag changes. Hard constraints govern only their owner's participation under the recommended policy.

### Message-by-message disclosure

“Humans” includes organizer/other owners. Normal UI shows own data/tasks, coarse state and final agreement, never a delegate transcript.

| Message | Other delegates learn | Other humans / organizer learn | Relay/server learns |
| --- | --- | --- | --- |
| PROPOSE / batch | Three policy-derived plans/versions; no claim author is free. Later proposals can reflect already-disclosed coarse counters. | Negotiating state; each owner can privately review a plan for their own acceptance, without others' choices. | Routing/epoch/tick/padded ciphertext. Public seed exposes initial candidates and possible later alternatives, not encrypted counter selections. |
| BATCH_ACCEPT / BATCH_REJECT | One sender compatibility/authorization bit across three plans; no matching subset. | No group answer or per-time total; own local state only. | Equal-size encrypted envelope/transport acknowledgement, not the bit. |
| ACCEPT / REJECT | One bit for one tested joint plan; positive signature is conditional commitment. Reject includes uncertainty/private refusal/no authorization, not a busy-event assertion. | No named peer answer/interim total; own approval screen exposes no other signers. | Encrypted until finalization; final certificate reveals only positive final-slot commitments. |
| COUNTER | One of four coarse regions or no hint, not exact free time/guaranteed-free interval. | “No slot yet”; no named range attribution. | Fixed-size encrypted field, no range semantics. |
| COMMIT / terminal withdrawal | Final agreement/certificate or generic stop, without failure reason. | Final slot/venue and own attendance, or coarse failure. | Final slot/required-quorum signers, or termination. Never failed-slot answers in plaintext. |

Delegate compatibility messages differ from raw calendars, but E2EE does not hide them from an owner instrumenting their endpoint. A curious owner can inspect decrypted messages. If “humans must never know” includes malicious endpoint owners learning even compatibility bits, this MVP cannot promise that: choose stronger computation instead.

### Concrete leakage budget and anti-probing

A nominal 168-hour week at 30-minute resolution has **336 binary occupancy cells**, potentially 336 independent bits (local DST weeks vary). The bounds below concern deliberate calendar-dependent message alphabets, not how many cells outside knowledge lets an attacker reconstruct:

- Nine individual option answers leak up to nine bits/person; a full arbitrary 336-slot free set up to 336. An exact private free-time counter also selects among hundreds of starts: up to `log2(336) ≈ 8.4` bits/start before further probes.
- Three binary batch replies: **≤3 bits**. Three exact replies: **≤3 more**. One five-valued counter: **≤log2(5) ≈ 2.32 bits**. Reserve one terminal freshness/withdrawal bit: **≤9.33 bits**, rounded to a **10-bit protocol-content budget per owner per target calendar week**, across recipients/colluders. Signatures bind already-counted semantics, not another calendar answer.
- “One of three” can become an exact answer if an attacker already knows two fail. Fixed-size/randomized answer subsets alone are insufficient. Never fake acceptance. Public random candidate sampling is independent of calendars, not differential privacy.

Enforce three batch permits, three exact permits, one counter and one terminal check per owner/target week across **all sessions, organizers, retries and overlapping horizons**. Charge cross-week batches to every touched week. Relay counters and a persistent owner-local ledger both enforce this. Key rotation, rejoin, deadline extension and duplicate delivery do not reset it. Same digest uses cached valid answer; changed venue/duration/roster is a new charged query. MVP permits one active device; future devices need encrypted owner-ledger synchronization. Recovery must not silently reset budgets.

Spending all three rounds on Saturday dinner leaves Ana no fresh permits for another dinner that week, even if everyone has time. It may end with “No slot yet”. Decision 15 compares this weekly limit, per-session allowances with a weekly ceiling, or a larger budget with more leakage. This usability trade-off remains unapproved.

Also: at most one new session round/hour and three active sessions/owner; no questions on refresh. Use padded fixed-size envelopes at 15-minute phase ticks while active, fixed control/counter fields, fixed delivery windows and no public arrival acknowledgements. Each tick opens a short fan-out window (target 30 seconds), not a 15-minute delivery hold: exact signatures must reach finalization within their five-minute validity. Otherwise expire/fail closed without silently re-signing. Offline devices still reveal absence to relay; no battery-intensive always-on cover traffic is promised. Local scheduling activity and packet timing must not be driven by when a private event ends.

The product owner's example, “waiting on 2 people”, needs an explicit choice in decision 8: subtraction from known answers can identify who answered. Recommend unnumbered status everywhere, pending that decision. No per-slot reason, named failure, private-score explanation, partial quorum, calendar freshness or coverage belongs in shared state. Calendar-dependent ordering, retries and errors add side channels and are forbidden. Online/lifecycle metadata and final output remain outside the ten-bit calculation. This is neither differential privacy nor a formal non-reconstruction guarantee: even one bit can be decisive with auxiliary knowledge. Exhaustion fails closed, without automated new-session workarounds.

### Match rate and the privacy trade-off

No typical success rate is measured. Nine candidates yield only **three exact tests**; nine tests need different permits and a larger budget. Batch acceptance does not identify a workable time.

For a rough four-person illustration, assume a 90-minute dinner, a 30-minute grid, two required people and a three-person quorum, one venue, counters disabled, and all devices online. A four-hour evening has six valid starts. If one or two starts meet quorum, three distinct uniformly seeded exact tests find one with probability **50% or 80%**, respectively. Over seven such evenings there are 42 starts; if only those same one or two starts work across the week, the chance falls to **about 7% or 14%**. This assumes scarce shared time; if every evening has feasible starts, the broader horizon need not reduce success. With no feasible start, success is zero; offline devices, private refusals and expiry also reduce it.

These are sampling estimates, not observed outcomes. Nine distinct exact tests exhaust the six-start grid and raise the 42-start case to **21% or 39%**, at greater disclosure and permit cost. Calendars determine feasibility; counters change sampling. Validate success and repeated-invitation tolerance before choosing decision 15's budget.

### Worked example: Ana, Bruno, Caio and Dani

Ana selects Family in Who with one tap, seeding Bruno, Caio and Dani with Bruno required. Their earlier joins through Ana's dinner links automatically created these host–guest connections after disclosure. She creates Saturday dinner in Pinheiros, São Paulo (`America/Sao_Paulo`), 90 minutes, public envelope 18:00-22:00, N=4, herself/Bruno required; threshold three. Mesa Verde is fictional; Bruno privately confirms vegetarian suitability. Creation targets the connections; Ana also shares the existing link. Selection, creation and sharing are actions 1-3.

Guests sign in, join through the link and claim their places during setup; Caio and Dani bind immediately. Disclosed link joins automatically create host–guest connections for new friends; these three already have connections, so this join reuses them without duplicates or guest–guest edges. Ana confirms Bruno's required claim (action 4). Ana and Bruno privately allow 18:00-22:00; Bruno confirms dietary suitability. Dani allows 19:00-22:00. Caio has an overlap until 19:00 and allows dinner through 22:00. These limits stay on their devices. Caio uses a supported local connector or manual private limits. No server connection is read.

Round one's publicly seeded batch is 18:00, 18:30 and 19:00, with 18:30 designated. Ana sends BATCH_ACCEPT and exact ACCEPT. Bruno sends BATCH_ACCEPT and exact ACCEPT. Caio sends BATCH_ACCEPT because 19:00 works, then exact REJECT for 18:30. Dani also sends BATCH_ACCEPT because 19:00 works, then exact REJECT for 18:30. Two exact approvals cannot meet the three-person quorum. Peers learn those bounded bits, without intervals, titles or reasons. Humans see “No slot yet”, without counts or named answers. This narrow envelope disables counters.

Round two's 19:30, 20:00 and 20:30 candidates come from the public seeded rule, **not anyone's calendar**; counters remain disabled. The designated plan is 19:30-21:00 at Mesa Verde. Ana sends BATCH_ACCEPT and exact ACCEPT; Bruno sends BATCH_ACCEPT and exact ACCEPT; Caio sends BATCH_ACCEPT and exact ACCEPT, each within grants after fresh local checks. Dani closes her browser before either reply: both results are unknown, despite her private window allowing these times. Silence supplies no approval. Humans are not told whether she is busy, offline or unwilling; the relay observes her device stopped sending. Quorum is reached, so round three does not run.

Ana privately reviews and presses **Approve and finalize** (action 5). Final certificate has Ana/Bruno/Caio's valid signatures: both required and three-person quorum. Relay publishes **Saturday 19:30-21:00, Mesa Verde, Pinheiros, America/Sao_Paulo**. Dani sees final slot and own “Unconfirmed”, no “3 of 4 approved”, past choices or “Caio rejected 18:30”. Later she may approve unchanged final plan within remaining budget, or manually confirm attendance without a calendar query. Late attendance does not reopen agreement.

Conditional attendees carry forward without another RSVP. Calendar entry is optional/local; reservation is **Not reserved yet**. The saved roster took one tap. This example has five coordination actions including the optional share; guest setup, constraints and failed rounds add effort. Do not promise two taps for the whole dinner or background convergence.

## 6. Authorization, relay operation and audit

Proposed commands: session start/claim, key bind, envelope relay, final-agreement publish and cancel. Private delegate input/grant/revoke has no shared constraints endpoint. Relay schedules delivery/deadlines, never private recommendations/calendar reads. No synthetic-host impersonation or worker intersection.

Authenticate canonical accounts separately from delegate keys. Bind session, policy/roster/key epoch, exact digest, scope, sequence and expiry to signatures. Owners grant response/conditional-attendance authority only; organizer alone finalizes manually. No delegate changes another's constraints/budget. Required claims pending confirmation cannot count; contested/duplicate claims cannot displace binding. Preserve one slot/account and N under undo/linking/transfers; names/email alone establish no quorum identity.

Deny direct table access from browsers and anonymous callers. Narrow commands check identity, membership, visibility, message structure, ciphertext size, permits and cancellation. The service role bypasses row-level security (RLS); RLS cannot keep calendars private from operators. Under consistent locks, check cancellation, revisions, key epochs, expiry, and distinct required and quorum membership. Publish the final agreement, dinner projection and minimal receipt atomically. Never make provider calls inside transactions or centrally “refresh everyone's availability”.

Opaque idempotency IDs; same ID/different payload rejected. Receipts never retain answers or dictionary-attackable yes/no hashes. Retry transport only within expiry/permit. Cancellation/revocation fences pending sends; key/member changes invalidate approvals. Policy changes cannot rescue stale signatures. Released final commitments remain known after deletion.

Exclude tokens, private data, plaintext messages and candidate outcomes from logs/analytics/support/traces/error reports/backups/model prompts. Keep only bounded coarse lifecycle/abuse metrics; no named bottleneck/response-time leaderboard. Review with synthetic calendars. Measure effort/return use without mining choices.

Private consent revocation or provider disconnect prevents further local reads/acceptance, clears credentials/cache and invalidates unsent authority. Revoke the shared signing grant/key epoch generically, without identifying a calendar or private policy. Optional attendees can withdraw without a reason; required/final commitment withdrawal reopens or cancels under explicit policy. Published commitments cannot be erased from peers. Saved-group leave/export/delete preserves these boundaries; admins inherit no vault access.

## 7. Dinner-state integration and human visibility

Proposed versioned `meal.negotiation` contains coarse state, public policy/roster epoch, final agreement, capabilities and own action requirement. No peer responses, scores, time aggregates, ties, named pending people, coverage/read timestamps. Owner-local data combines on device, never inside shared meal JSON.

Keep `derive()` pure with supplied `now`, cancellation first and stable reservation labels. Add negotiation-aware states such as `negotiating`, `needs-own-action`, `ready-for-own-review`, `finalized`, `expired`. Hidden responses do not imply zero votes. Update planner dispatch/home/details/mobile receipts together; unknown action IDs currently fall toward organizer controls. Restaurant rules require their own projection.

The organizer sees no other person's time answers, counts, named waiting or rejected people, and has no override. Roster administration is separate. Owners can see their own local conflict details. Recommend disclosing final **affirmative participation only with explicit consent**, where needed for dinner, never named tentative or declined replies or their history. The relay necessarily knows certificate signers; people may infer willingness for the final slot. This exception needs product acceptance.

Edits to the schedule, duration, zone, venue or roster require a new exact version and local approval; old time ballots cannot authorize them. Preserve current reconfirmation intent (clear `confirmedSchedule` and `calendarAccept`, invalidate reply hashes, request reconfirmation), without shared reconfirmation lists. Attendance is separate from calendar writing and email sharing. Existing `syncDinner()` must not run here. Recommend owner-local ICS or private entries. Agreement never sets `Booked`; reservation values `Unbooked`, `Booked`, `Confirmed`, `In-person booking only` retain their meanings.

## 8. Compatibility, retirement and rollout

Keep dinner IDs, invite UUID/hash links, 22-character codes, static redirects and manual reservations. Successful disclosed joins also create section 3's host–guest connections, never automatic saved-group membership, delegate keys or calendar consent. Guard cancelled/blocked joins and require disclosed confirmation before current auto-join paths. Public previews stay generic.

Close shipped paths first: remove time answers/counts from every read/cache, disable plaintext time ballots/host bypass, then delete historical time-answer JSON with backup policy. Preserve identity/restaurants/legitimate final dinner facts, not vote timelines. Never backfill calendars or old ballots into delegates. Imported final plans are “legacy host choice”, not fabricated approval.

Flags can stage storage/read/relay/local-calendar rollout, never permit old-client fallback exposing votes/shared conflicts. Reject incompatible requests with upgrade requirement. Clear/version sensitive old drafts/storage on upgrade/logout/account switch. Opted-in meals have one finalization authority; `manage` cannot remain a writable time bypass.

Retire operator-readable broad grants globally before full compliance. Otherwise release only a bounded local pilot and explicitly acknowledge legacy conflict. Old event deliveries/chat caches/recipient copies cannot be undone. Rollback pauses negotiation/preserves final agreement; it never restores central reads, snapshots or time-vote exposure.

## 9. Phases and effort

Developer-weeks include UI, validation and rollout. Loop hours assume 5-6 minute Codex runs, 2-4 reviews per sub-slice, reading, verification and fixes. They exclude waiting, external reviews and pilot observation, which can add weeks. This design revision claims no application tests.

| Phase | Developer-weeks | Rough loop hours | Scope and exit criteria |
| --- | --- | --- | --- |
| 1. Fix live privacy leaks | 2-3 | 8-16 | Close read projections, plaintext ballots, previews and caches; retire legacy tokens/workers. Exit: no peer time answers on API/UI; full-product claim requires verified retirement. Ships first and independently. |
| 2. Friends and saved groups | 2-3 | 10-20 | Section 3: disclosed joins, identity, private groups/targets, block/report, optional import. Exit: repeat-invite targets met, neutral block behavior, no roster/calendar leakage. No delegates required. |
| 3. Manual delegates and relay | 3-4 | 16-30 | Local vault/grants, signed identity/keys, frozen claims, E2EE relay, bounded protocol, expiry/certificates and coarse UI. Exit: worked example including offline failure, no server-visible answers. |
| 4. Review and pilot | 2-3 | 12-24 | Independent crypto/privacy review, probing, budgets, deletion/backups, concurrency and old clients. Exit: observed behavior matches accepted leakage contract, including social permissions. |
| 5. Hardening | 2-4 | 10-20 | Account isolation, recovery, accessibility, operational minimization and pilot fixes. Exit: failures/rollback never restore privacy leaks. |
| 6. Optional local calendar | +3-5 | +16-30 | One device-only provider path; coverage, DST, staleness and revocation. Exit: shared service cannot obtain tokens/events; manual fallback. |

**Totals: phases 1-2 need 4-6 developer-weeks and 18-36 loop hours; through phase 5, 11-17 weeks and 56-110 hours; with phase 6, 14-22 weeks and 72-140 hours.** Review depth affects these estimates. Shared `checkConflicts()` cannot provide compliant calendars. Other providers, attested delegates, MPC, memory, communities and booking need separate estimates.

Implementation checks need synthetic network/server-boundary inspection, not only UI snapshots: no raw calendars/answer vectors in relay/storage/telemetry; TTL/key recovery/substitution; budget replay/resets across devices/sessions/overlapping weeks; malicious proposals; logout/XSS; required identity/quorum; stale signatures/double-finalize/cancellation; late replies; DST/all-day handling; incomplete coverage; preview/chat leakage. Preserve useful reservation/restaurant behavior within the new contract.

## 10. Risks and residual leakage

| Risk | Mitigation / remaining limit |
| --- | --- |
| Transcript inference | Budget, coarse counters, calendar-independent candidates, E2EE/short retention. Peers can retain bits/combine outside knowledge; no zero-inference promise. |
| Curious/colluding members | One target-owner budget across recipients/sessions. Endpoint inspection exposes permitted messages. MPC needed for materially stronger endpoint-owner threat model. |
| Relay metadata | Fixed size/ticks, no public acknowledgements. Server still sees identities/routes/absence/retries/horizons/final signers/slot. No anonymity guarantee. |
| Operator/supply chain | Owner-held calendar keys, reviewed/pinned releases/authenticated bindings. Malicious browser update/native build can steal owner data; local execution alone is not verifiable delivery. |
| Offline/low convergence | Unknown remains unknown, short signature validity, manual reminders/bounded rounds. Public sampling sacrifices match rate; validate user tolerance. |
| Recovery/Sybil probing | Canonical identity, relay permits/local ledger; malicious identity resets or compromised devices/infrastructure not fully prevented. Never silently replenish on reinstall. |
| Staleness/provider gaps | Own checks within five minutes before signing, private manual fallback. Events can change after acceptance; no multi-owner refresh worker. |
| Old tokens/copies | Revoke broad grants, stop workers/purge votes/expire backups. Prior operators/recipients/crawlers may retain copies; knowledge cannot be erased. |
| Calendar invitations | Private entries avoid attendee/reply exposure. Future shared invitations need explicit final-time/email/RSVP disclosure to providers/humans. |
| Food/location/commitments | Owner evaluates hard limits; unknown evidence needs confirmation. Places results never establish seating, allergy safety or reservation. |

No LLM operating budget in MVP. Security review/local integration/support dominate cost; encryption needs operational discipline. Existing caps remain separate: 900 Places searches and 900 photos/month; invitation photos 30/minute and 150/day/dinner. No new provider/commercial capability verified.

## 11. Defensibility / moat

Privacy-by-design differentiates only if Enkai demonstrates operators cannot collect calendars and hosts cannot inspect time ballots. Reviewed message limits, owner-held keys, inspectable protocol, deletion and honest offline behavior can earn returning-group trust. Removing titles alone cannot.

The **saved groups and connection graph are the compounding asset**: each consented repeat connection and useful saved roster makes the next dinner easier. It is defensible only if members value that convenience and trust the privacy controls; stored names alone are no moat. Keep removal, consent, export and deletion practical rather than relying on lock-in. Measure repeat use, setup actions saved and successful dinners without mining calendar patterns, rejection histories or named failed-slot logs. Consented restaurant experiences and verified venue relationships may add value later; Places ratings prove neither capacity nor partnerships.

## 12. Product decisions

The quoted privacy requirement overrides the former architecture. Previously accepted choices remain **DECIDED 2026-11-26** where valid. Adding connections and saved groups is approved, but policies in decisions 21-29 are **NEEDS PRODUCT OWNER INPUT**. Recommendations are not retroactive approval. Existing decision numbers 1-20 stay stable; rejecting a recommendation cannot restore the shared evaluator.

1. **Audience — DECIDED 2026-11-26:** private friend groups of 2-12; workplaces/open communities deferred.
2. **Quorum — core DECIDED 2026-11-26:** required people including organizer plus `max(required_count, ceil(2*N/3))` distinct exact-version approvals; unanimous alternative. Freeze N/placeholders/required flags; silence never counts. **NEEDS PRODUCT OWNER INPUT:** optional veto semantics. Options: every included owner's private veto blocks, or optional nonapprovers simply do not attend. Recommend latter with owner authorization. Replaces all-included-hard-constraints feasibility check; no central checking remains.
3. **Finalization — DECIDED 2026-11-26:** human organizer approval-and-finalize; bounded delegation later.
4. **Calendar launch — NEEDS PRODUCT OWNER INPUT:** manual-local first, local-calendar extension, or attested always-on workstream. Recommend manual MVP/gated local pilot (+3-5 person-weeks). Replaces decided server-connected-calendar MVP (+1-2 weeks); old broad tokens/read functions cannot be reused.
5. **Durable groups — DECIDED, updated 2026-11-26:** add invite-link connections and saved groups before blind delegates. This supersedes the earlier durable-group deferral. Saved groups seed separate per-dinner groups, never automatic membership or delegate authority. Specific policies remain open in decisions 21-29.
6. **Memory — core DECIDED 2026-11-26:** session default, editable per-group opt-in later, no account-wide memory without consent. **NEEDS PRODUCT OWNER INPUT:** local-only versus encrypted owner-sync later. Recommend local-only MVP. Replaces evaluator-readable constraints/preferences; never retain peer rejection patterns.
7. **Ties — NEEDS PRODUCT OWNER INPUT:** capped blind rounds/no runoff, or privacy-reviewed encrypted runoff within same budget. Recommend no time tally/tie/runoff; three rounds then coarse failure. Replaces decided one runoff within three rounds. No automatic/host-weighted winner.
8. **Visibility — NEEDS PRODUCT OWNER INPUT:** final slot/coarse status, own local data only. Options: unnumbered status, counts above a reviewed group-size K, or counts for everyone. Recommend unnumbered: “waiting on 2 people” plus known answers can identify respondents even in larger groups. Counts need a revised budget. Replaces “aggregates plus own answer”.
9. **Booking — DECIDED 2026-11-26:** coordination/manual reservation recording; holds/payments/bookings deferred.
10. **Retention — core DECIDED 2026-11-26:** constraints expire dinner plus 30 days; audit 90 days; persistent memory requires opt-in. **NEEDS PRODUCT OWNER INPUT:** section 4's minimal local/answer-free retention or longer encrypted recovery history. Recommend five-minute exact-answer expiry, round-close deletion, acknowledgement deletion/24-hour relay ceiling, 15-minute memory-only cache and dinner-plus-30-day final evidence; no indefinite ciphertext backups.
11. **Reminders — DECIDED 2026-11-26:** manual drafts now, opt-in delivery later; no background notification promise. Drafts must not name scheduling bottlenecks.
12. **LLM — core DECIDED 2026-11-26:** deterministic MVP; model/provider not selected. **NEEDS PRODUCT OWNER INPUT:** none, owner-local parsing later, or separately reviewed owner-isolated confidential model. Recommend none in MVP. Replaces optional capped small-model parsing/explanations; shared models cannot receive multiple owners' calendars across calls.
13. **Claims — core DECIDED 2026-11-26:** explicit self-claim, immediate optional binding, required-only organizer confirmation, visible undo/disputes; one account/slot. Friends/groups now seed targeted placeholders; targeting is not joining or approval. Private inputs stay local; claims confer no calendar access. Targeting/block details remain proposed.
14. **Runtime/operator trust — NEEDS PRODUCT OWNER INPUT (new):** device, ordinary server isolation, or attested per-user delegate. Recommend device; ordinary isolation fails requirement. Replaces shared evaluator/workers; full-product claim requires legacy token/read retirement.
15. **Protocol and leakage budget — NEEDS PRODUCT OWNER INPUT (new):** bounded negotiation or stronger MPC research. Budget options: (a) three batch permits, three exact permits and one counter per owner/target week across sessions; (b) per-session allowances with an explicit weekly ceiling; (c) larger weekly budget/more leakage. Recommend (a) for the pilot, testing tolerance for blocked second/third invitations. Never replenish silently. Option (b) needs ceiling values and a revised bit bound. Three rounds test three exact plans, not nine. More tests improve section 5's illustrative 7-14% broad-horizon success but exceed the ten-bit baseline at nine exact tests. Replaces central scoring/time votes. Zero endpoint compatibility-bit disclosure needs stronger computation and re-estimation.
16. **Encryption/keys — NEEDS PRODUCT OWNER INPUT (new):** reviewed E2EE/independent key verification, plaintext relay, or operator-recoverable keys. Recommend E2EE/no escrow with recovery/offline costs. Plaintext reveals every answer/slot to relay, outside recommended contract.
17. **Restaurants — NEEDS PRODUCT OWNER INPUT (new):** standalone restaurant aggregates with hidden names/consent, or suppress all ballots. Recommend retain restaurant-only aggregates; time-linked answers get scheduling protection. Replaces uniform time/restaurant aggregate policy.
18. **Final attendance/previews/writes — NEEDS PRODUCT OWNER INPUT (new):** participant-only final time, consented positive attendance/private entries, or link-public time/shared invitations. Recommend participant-only, no named negative RSVPs, private entries. Replaces public selected-time previews/shared attendance/server sync; relay still sees final signers.
19. **Legacy rollout — NEEDS PRODUCT OWNER INPUT (new):** global retirement, or bounded pilot acknowledging legacy conflict. Recommend phase 1 privacy closure first; it can ship independently of delegates. Recommend global closure and privacy-safe rollback. Replaces untouched legacy time-poll behavior. IDs and links stay; incompatible clients upgrade.
20. **Delegate acceptance authority — NEEDS PRODUCT OWNER INPUT (new):** bounded conditional-attendance grant or human confirmation before each exact ACCEPT. Recommend bounded local grants with optional confirmation. Explain expiry, constraints, budget and revocation first. Replaces mandatory **Approve and attend** per proposal; organizer finalization stays human. Joining, saved membership or calendar connection never grants acceptance authority.

21. **Connection scope — NEEDS PRODUCT OWNER INPUT:** host–guest only or all attendees. Recommend host–guest: all-attendee edges expose identity and shared-dinner participation to strangers.
22. **Connection visibility — NEEDS PRODUCT OWNER INPUT:** visible to both or private host-only saving. Recommend both can see/remove, with quiet receipts and no notifications; no peer list access.
23. **Backfill — NEEDS PRODUCT OWNER INPUT:** A silent backfill, B bilateral-confirmed suggestions, or C new joins only. Recommend B, with C for people declining historical suggestions; names never bind automatically.
24. **Saved-group sharing — NEEDS PRODUCT OWNER INPUT:** private only, explicit consent-filtered sharing, or automatic member visibility. Recommend private-only MVP; consent-filtered names later, no public links.
25. **Block semantics — NEEDS PRODUCT OWNER INPUT:** targeting-only restrictions or bilateral targeting/join restrictions including third-party co-targeting. Recommend the latter with neutral failures, no retrospective rewriting, generic active-session review and no silent quorum changes.
26. **Contacts matching later — NEEDS PRODUCT OWNER INPUT:** none, later consented address-book matching, or MVP matching. Recommend no MVP matching; later uploads require separate consent, nonuser protections, opt-out and deletion.
27. **Saved-group size — NEEDS PRODUCT OWNER INPUT:** 11 invitees, a larger reusable list with dinner selection, or uncapped. Recommend 11 plus owner to preserve the 12-person dinner limit.
28. **Ownership transfer — NEEDS PRODUCT OWNER INPUT:** none, consented transfer, or automatic succession. Recommend none in MVP; later transfer requires new-owner acceptance and member consent.
29. **Connection consent — NEEDS PRODUCT OWNER INPUT:** disclosed automatic link-join activation or bilateral opt-in on every new pair. Recommend disclosed automatic activation for ease, bilateral confirmation for historical suggestions/restoration; retain endpoint consent fields for future mutual opt-in.

Verification boundary: only local source inspected. No network, live Supabase/project, provider capability, deployment, worker schedule or booking partnership accessed/verified. Commands, records, controls, limits and effort are proposals; only this document is revised.
