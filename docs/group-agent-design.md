# Enkai group agent: blind personal delegates

## 1. Summary

**Make meals with friends and family easy.** Decisions 1-29 were accepted on 2026-11-26. Later that day the product owner changed the delivery direction: **“Yes, build the central agent first with the per-person upgrade path.”** This is **decision 30 — DECIDED 2026-11-26**. Phase 1 now keeps the first-half privacy fixes (done locally) and adds the interim central scheduling agent in [section 2A](#2a-interim-stage-central-scheduling-agent-with-a-per-person-upgrade-path). Time polls and calendar connect stay. Friends and saved groups follow, then blind delegates, review and hardening. In the Who step, one tap selects a saved group; a past friend takes 1-2 taps; a first invitation still needs one link-share action. These count invitation setup, not the entire dinner workflow.

**Long-term privacy requirement, 2026-11-26 (interim exception in decision 30):**

> Users must not know each other's calendar availability. We want to protect the user's privacy, period. When the agents discuss availability, it's like two agents negotiating a time slot that works, not one agent checking between two calendars and finding something that works. I want both agents to be blind to the other person's calendar, to maximize privacy.

The interim stage protects availability from other users, including the host, but Enkai's server processes it. **It does not satisfy the long-term “no central component” requirement.** The architecture below remains the blind-delegate destination; section 2A governs the interim release where the two differ.

### How blind negotiation works (long-term destination)

Each guest's assistant keeps their diary closed, checks public dinner proposals against its owner's private rules, and sends limited encrypted answers. Nobody shares a calendar or free-time list; the organizer has no special access.

When enough assistants approve the same exact plan, including everyone marked required, the organizer reviews it and finalizes the dinner. People see the agreed plan and simple progress messages. They do not see who rejected a time or how many people liked each option.

Fewer proposals disclose less but can miss workable times. Offline assistants cannot approve. Encryption hides answers from Enkai's relay, but endpoint inspection can reveal permitted answers. Neither perfect secrecy nor a match is guaranteed.

Use **one delegate per person**, reading only its owner's calendar/private rules and permitted session messages. No shared runtime, storage, logs, analytics or LLM receives multiple owners' calendars, free/busy, private windows or reconstructable availability aggregates. Removing titles is insufficient. No central intersection or availability snapshots exist.

The service authenticates, relays ciphertext, enforces limits and records agreement. A rotating delegate proposes without privileged access. Humans see final agreement and minimal progress, never peers' ballots, reasons, per-time counts or leaders.

**Privacy boundary:** final agreement necessarily reveals willingness to attend that slot; rejection can reveal a compatibility bit. Neither proves calendar occupancy. The accepted protocol bounds disclosure and encrypts it from the relay. It cannot guarantee zero inference against colluding participants, outside knowledge, compromised endpoints or an operator replacing browser code. The product owner accepted these limits on 2026-11-26; this is not a claim of perfect secrecy (section 12).

### MVP at a glance

The product serves dinners of 2-12 people. The interim MVP uses server delegates over private poll ballots and title-free calendar checks, a deterministic matcher and organizer approval. Only the organizer is required; joined members form the check-time roster. Phase 2 adds friends, saved groups and required-person placeholders. Phase 3 upgrades to **on-device deterministic delegates and end-to-end encryption (E2EE)** with manual private constraints first; local calendars follow proven device-only credential custody. That later version uses claimed rosters and exact-plan approvals. No phase uses an LLM or autonomous booking.

The later blind protocol in section 5 allows three rounds, each proposing three candidates under a public rule. Each person sends one batch compatibility bit and one exact candidate answer per round, with at most one coarse counter for the entire budget period. Its ten-bit content budget applies per person per target calendar week across all sessions; it is not a guarantee for the interim central stage. Section 2A defines interim results and probing limits. Expiry or silence never means acceptance.

**Interim shared storage** retains existing private time ballots until their purge deadline and adds one coarse agent-result row per dinner, with no per-person computed answers. Calendar refresh tokens remain server-side. Later shared storage holds connections, private groups, rosters, keys, encrypted envelopes, budgets and final agreements, while private inputs and credentials move **to the owner's device**. Including the interim stage, friends and groups, estimate **12-18 developer-weeks and 64-122 hours of Codex-plus-reviewer loops**, or **15-23 weeks and 80-152 loop hours** with one local calendar integration. These whole-program estimates include the first-half work already done locally. Loop time is not total delivery time; see section 9.

This is design only. No application behavior, SQL, migration, deployment or calendar authorization changes are made here.

## 2. Current state and conflicts with shipped UI

Evidence is local checked-in source, including `202611270001_privacy_list_projection.sql`; deployment state has not been inspected. The application is still a host-managed poll. The first-half phase 1 privacy fixes are **done locally**; the central agent in section 2A is decided design, not implemented behavior.

`meal_plans` stores dinner JSON/version/invite; `meal_plan_members` stores provider-derived account strings, names and response JSON, including `response.times`. `supabase/functions/meal-planner/index.ts` verifies Google/Microsoft or remembered sessions, then uses service-role RPCs. `canonicalAccount()` and `meal_microsoft_links` reconcile identities; these accounts are not established `auth.users` UUIDs. No scheduling delegate or agent-result table exists yet.

`planner.js` keeps saved names and manual busy blocks on the device. Dinner `guests` and `attending` are name lists, not account bindings. Joining with an invite creates membership without requiring a ballot or proving attendance. There is no social graph yet. The UI sorts time options chronologically before saving; the saved array, rather than any vote-based order, is the interim matcher's input order.

The RPC chain remains `meal_planner_action` -> `meal_planner_before_calendar` -> `meal_planner_rsvp_action` -> `meal_planner_suggestions_action` -> `meal_planner_base_action`. The latest outer definition is now `202611270001_privacy_list_projection.sql`. It intercepts `list`, retains cancellation locks/guards for mutations, separates availability from final RSVP, and invalidates schedule confirmation/calendar replies after relevant edits. `respond` checks the plan version; legacy `vote` does not. Agent invalidation must cover both.

### Privacy fixes kept, and remaining work

| Source / boundary | Local behavior now | Interim work still needed |
| --- | --- | --- |
| Privacy list projection | Explicit allowlist; caller-only `myVote`; peers' `responses: []` and `joinedCount: 0` compatibility fields. No peer ballots or time totals. | Add organizer-only `agentResult` with the narrow shape in section 2A. Never merge arbitrary details or computed answer vectors. |
| `attendanceResponses` | Named Going only, after date and restaurant are set, excluding replies needing reconfirmation; no named Maybe/declined/history. | Preserve affirmative disclosure consent and reconfirmation behavior. Scheduling eligibility is separate from attendance. |
| `restaurantTallies` | Anonymous standalone restaurant totals, organizer-only while restaurant is undecided and dinner is active. | Keep this exception. A restaurant answer tied to a candidate time is scheduling data, not a standalone restaurant vote. |
| `dinner-state.js`, `planner.js` | Pure derived state ignores legacy peer responses; no time leaders, ties, counts or named time answers. Restaurant totals remain. Host still picks the time through `manage`. | Add coarse agent states, approval and explicit host-choice labeling without restoring time tallies. Existing organizer-only `hasOtherResponses` is a generic response-presence bit, not scheduling evidence or quorum progress. |
| Public `preview`, invitation/preview fixes | Previews omit time; the edge handler returns title, area, restaurant, cancellation, photo flag and first host name, without ballots or roster. | Preserve previews without time and final-time participant access. Previously cached recipient/crawler copies cannot be recalled. |
| Edge mutation validation | `vote`/`respond` accept time ballots; create/manage accept options, zone and duration; selected time must be an option. | Keep ballots private; add run authorization, invalidation and retention. Do not retire time polls. |
| `calendar.ts`, `calendar-core.ts` | Server decrypts refresh tokens with shared `CALENDAR_ENCRYPTION_KEY`. Google range reads have no fields mask; Microsoft selects `subject`; normalizers retain titles and conflict responses return them to the requesting user. | Keep calendar connect, but make scheduling reads title-free and own conflict notes say Busy. Free/busy stays in memory. |
| Calendar sync and `manage` | Optional server sync creates/updates provider invitations; schedule changes require reconfirmation. Provider copies can expose attendee emails and replies. | Preserve the existing optional flow with honest disclosure; no agent auto-finalization or automatic attendance consent. Private device entries remain the long-term goal. |

Restaurant preferences, dietary and location data can also be sensitive. Preserve consent for standalone aggregates. Dining-guide ballots are separate from dinner scheduling. Existing UI guidance that asks for time leaders or named time responses is superseded by this privacy contract; those other files are unchanged by this revision.

## 2A. Interim stage: central scheduling agent with a per-person upgrade path

**Decision 30 - DECIDED 2026-11-26.** The product owner said: "Yes, build the central agent first with the per-person upgrade path." This replaces the retirement-first recommendation in [the superseded phase 1 finalization proposal](privacy-phase1-finalize-proposal.md). Time polls and calendar connect are **not retired**. This section governs the interim stage; sections 4-8 describe the later blind-delegate destination where they differ.

### What users see

People tick the times they can attend. Enkai checks those choices against any connected calendars and proposes one time to the organizer. The host gives the final OK. Other users, including the host, never see a person's availability or conflict details.

The organizer's scheduling result is only **"A time works"**, with the single proposed time, or **"No time works yet"**. The chosen plan remains visible to dinner participants. No availability counts, names attached to answers, per-time outcomes, rankings, rejection reasons or partial quorum appear in UI, API responses, accessible text, previews or support views. The host can still see their own answers and invitation administration; Going-only attendance and anonymous organizer-only standalone restaurant totals remain the narrowly scoped exceptions from section 2. Guests see their own answers and the final plan, without the organizer's agent-result card or anyone else's answers. Public candidate options are proposals, not reports of availability.

Before the minimum group size, show **"Waiting for more responses"** without counts. While a run is pending or fails before producing a result, show a neutral progress/retry message rather than fabricate a negative match. A completed none means no candidate met the conservative eligibility check; it does not establish that anyone is busy. Suggested privacy wording, once the purge behavior below ships:

> Other guests and your host never see your availability. Enkai processes it to find a time and deletes it after the dinner.

Explain that deletion follows a finalized dinner's end, or cancellation; an open, unfinalized poll is still being planned. Do not claim that Enkai cannot access calendars. Calendar connection and a poll yes are not final attendance consent.

### Delegate interface: the upgrade seam

A delegate belongs to one canonical person and answers exact candidate plans with yes/no. The scheduling portion of the propose/answer protocol is stable:

```ts
type CandidatePlan = {
  start: string; // ISO instant, canonical UTC, e.g. 2026-12-05T19:00:00.000Z
  durationMinutes: number;
  timeZone: string; // IANA destination zone
};

interface SchedulingDelegate {
  readonly memberRef: string; // internal canonical participant reference, never a result field
  answer(candidates: CandidatePlan[]): Promise<boolean[]>;
}
```

Answers have the same length and order as candidates, with no reasons, private windows or scores. The contract means PROPOSE exact plan -> ACCEPT/REJECT, as in [section 5](#5-negotiation-protocol-and-disclosure-limits); it does not assert that interim server calls are encrypted blind negotiation. Later transport binds these scheduling fields to the full plan digest, venue, policy/roster version, signature and expiry required there. `answer()` is an internal adapter, not a browser API exposing a person's vector.

Interim **`ServerDelegate`** runs server-side. For each candidate, its answer is:

`person ticked that exact start in their poll ballot AND (no connected calendar OR all their connected calendars were checked completely and show no overlapping busy interval for the duration)`.

Untouched/no ballot, an unticked option or an incomplete/unreachable connected calendar yields no. Calendar checks can only turn a poll yes into no; an empty calendar cannot create a yes. Explicitly disconnected means no connected calendar; a reconnect-required connection is unknown and cannot be treated as clear. Use the existing half-open overlap rule (`start < otherEnd && end > otherStart`), destination-zone/all-day normalization, complete pagination and own-dinner event exclusion. Manual local busy blocks remain the owner's aid; they are not silently uploaded.

Later **`DeviceDelegate`** replaces `ServerDelegate` behind the same interface. It evaluates its owner's local constraints and acceptance grant. The matcher and UI flow do not change merely because the delegate implementation changes. Stored source ballots remain interim inputs until purged; the computed per-person yes/no arrays exist only in memory during a run, are discarded on completion/failure, and are never stored, returned or logged.

### Central matcher and organizer approval

The matcher is **deterministic, with no LLM**:

1. Candidates are `details.times` in the organizer's saved order, each paired with `details.duration` and `details.timeZone`. This order is public and independent of answers/counts. Today's UI saves chronological order; do not re-sort it by availability. Require a valid destination zone before checking.
2. Freeze participants at check time: organizer plus every joined member, deduplicated by canonical account. N includes people without a ballot; they answer no. Unjoined names and saved-group targets do not count. Required people are **the organizer only** in this stage. Per-guest required flags arrive with phase 2 placeholders; never silently infer them from name lists.
3. Collect exact answers through each delegate. A candidate is eligible if **every required person answers yes** and `yesCount >= max(required_count, ceil(2*N/3))`.
4. Return the **FIRST eligible candidate in option order**, otherwise none. Never rank by yes-count, so there is no count-based tie or runoff. Compute the same way for one option.
5. Publish only `{status: 'works' | 'none', proposedTime?, computedAt, optionsVersion}`. `proposedTime` is the candidate's ISO start and exists only for works. `computedAt` is the run timestamp; `optionsVersion` is a digest/version of the ordered candidate plans. No N, count, participant reference, answer vector or failed-option list leaves the run.

**"Approve this time"** sets `selectedTime` through the existing authenticated, owner-only, version-checked `manage` path. Revalidate that the result is current before offering agent approval. The organizer may choose another option manually, clearly labeled **"Host choice"**, with no claim of agent approval. The agent never auto-finalizes, marks people Going, sends attendance consent or marks the reservation Booked. Choosing the time can precede choosing a restaurant; existing final-plan RSVP requires both. Relevant edits retain the current reconfirmation behavior.

Freeze an input revision with the participant set, candidates and ballots. Invalidate results on option, duration, zone, ballot, membership or relevant calendar-connection changes; a membership change makes a fresh roster for the next run. Recheck the revision before saving a result, discard a superseded run, and never offer a stale result as current. A connected calendar can change externally: explicit refresh checks again; a result is an as-of check, not a guarantee of future availability. Ballot willingness is not the future protocol's signed conditional-attendance certificate.

### Probing limits and residual disclosure

Recompute only when options/ballots change or on explicit refresh, with roster/connection changes invalidating the cached result and requiring a fresh check. Reading a page or polling `list` never triggers an agent run. Reuse a current result for unchanged inputs; explicit refresh may fetch fresh calendar free/busy. Use a shared **cap of 6 agent runs per dinner per UTC day**, including refreshes, edits, failures and concurrent attempts. Reserve quota atomically before provider reads; retries and reordering options do not reset it. Quota exhaustion gives a neutral retry-later state, without publishing a made-up none result.

Require **at least 2 other joined participants**, besides the organizer, before showing any agent result. This gate checks joined membership, not a response count; its wording does not assert everyone answered. Small dinners still allow a manual host choice. A single-option poll uses the same gate, cap and coarse result, with no special count display.

An organizer can still probe by changing options, using outside knowledge or arranging membership. Each run reveals a works/none **bit about the quorum**; a successful multi-option run also identifies the first qualifying time, implying earlier options did not qualify. The public first-match rule removes count-based ranking leakage, not all inference. Six runs bound checks within one dinner/day, not across colluding accounts or dinners. This is neither zero leakage nor section 5's per-owner ten-bit blind-protocol guarantee.

### Calendar reads without titles

Keep calendar connect and optional final-plan sync. Change the **scheduling/conflict read path**: for Google, use `freeBusy` or an events fields mask excluding `summary`, `description` and `attendees`; for Microsoft, use `getSchedule` or `$select` without `subject` or other unnecessary content. Prefer provider free/busy when event omission would lose declined/transparent-event semantics. Preserve busy/overlap correctness, complete coverage, pagination and own-dinner exclusion. Do not apply scheduling-only masks blindly to invitation write/reply synchronization, which has different needs.

Normalize scheduling conflict labels to **"Busy"**, including the requesting user's own conflict notes, rather than event titles. Never persist fetched free/busy, event bodies or range caches; use memory for this run only. Do not send anyone's intervals, provider errors or connection status to another user. Existing caller-only conflict aids must use the same title-free reads.

Refresh tokens still live server-side as `refresh_cipher`, encrypted using AES-GCM with the shared `CALENDAR_ENCRYPTION_KEY`. The server can decrypt them and can technically read events under the existing broad provider grants. Removing titles from requests reduces collection; it does not revoke that capability. Providers hold their own copies; shared invitations can disclose attendee emails and replies, and previously delivered events remain outside Enkai's deletion control. Explain that optional sync separately. Moving credential custody and calendar reads into each person's delegate, then retiring shared access, closes this operator-access gap later.

### Storage, retention and purge

Add one service-only row per dinner, conceptually:

| `meal_agent_results` column | Meaning |
| --- | --- |
| `meal_id` | Primary key, FK to `meal_plans(id)` with delete cascade. |
| `status`, `proposed_time` | works/none; proposed time present only for works. A pending/invalidated row may leave these null; never project it as an answer. |
| `options_hash`, `computed_at` | Ordered candidate digest and check timestamp; exposed as `optionsVersion` and `computedAt`. |
| `runs_on date`, `runs_count` | UTC quota date and atomically reserved run count, not availability data; preserve through invalidation. |

Enable RLS and revoke all table access from `PUBLIC`, `anon` and `authenticated`; service role only. The edge handler verifies identity, canonical membership and organizer authority for result reads/refresh/approval; service-role use alone is not authorization. Extend the allowlisted `list` projection to return `agentResult` **only to the organizer**, omitting it for guests. Return only the four-field result contract, never quota internals. No per-person result rows, computed answer hashes or persistent vectors. Track validity against an internal meal input revision, without storing a ballot digest or response history in this table.

Purge **time ballots (`response.times`) and any computed availability** as soon as a dinner is cancelled, or is **finalized-and-past**: both selected time and restaurant exist and `selectedTime + duration <= now`. Approval alone must not delete ballots before the dinner ends. Preserve standalone restaurant preferences, legitimate plan facts and consented affirmative attendance under their own retention rules; never preserve ballot copies in arbitrary details, drafts or logs. Per-run answer arrays and fetched free/busy are erased immediately when the run ends or fails.

A coarse agent result contains no per-person data. Delete it with the dinner or no later than **dinner end + 30 days**; cancelled dinners may delete the row immediately. Invalidation clears the projected result without resetting that day's quota. These interim lifetimes amend decision 10; section 4's five-minute signatures and relay TTLs apply to later blind messages, not stored poll ballots.

Implement an idempotent, service-only purge function, for example `purge_meal_scheduling_data(now)`. Run it in the cancellation transaction and on dinner deletion (with FK cascade), plus an hourly scheduled sweep for finalized-and-past dinners and expired result rows. Run an overdue sweep at deployment/startup and guard scheduling reads/writes so ended or cancelled dinners cannot expose or recreate purged time data between sweeps. Clear/version requester drafts and caches on lifecycle refresh, upgrade, logout and account switch. Apply the same deadlines to replicas, exports and backups through expiry or erasure; do not restore expired time data during recovery. Offline clients and previously copied data cannot be remotely recalled. Verify purge failures/retries without logging ballot content.

### Upgrade to blind delegates

Keep **CandidatePlan**, exact yes/no semantics, required-plus-two-thirds eligibility, public first-eligible selection, organizer final OK, coarse UI states and the result shape. Phase 2 adds explicit required-person placeholders without changing the rule. Change the delegate to `DeviceDelegate`, put signed answers on section 5's E2EE transport, and move the matcher to a rotating participant delegate. Private inputs, keys and calendars then remain with their owner; the server becomes relay/final-agreement verifier. Retire shared tokens/read workers only as that later transition is verified.

The future protocol limits which candidates can be tested and how often. Adapt `answer()` calls to its publicly ordered, designated exact tests and budget; do not broadcast full poll-answer vectors or carry the interim six-run allowance into blind negotiation. Section 5's batch/counter messages are additional bounded transport operations, not permission to expose interim ballots. The same first-eligible rule applies to eligible exact-tested plans in public order; untested/missing answers are never yes. No ballot is migrated as a signed grant or approval. The blind protocol may find fewer matches and require devices online, but changing delegate implementation does not require a new matcher rule or user flow.

**This interim stage does not meet the long-term no-central-component requirement.** RLS, shared-key encryption, title-free reads and an answer-free result do not make a central computation blind. Decision 30 accepts that temporary trust boundary, with section 9 estimating delivery work.

## 3. Friends and saved groups

### Ease of setup

People joining dinner links become reusable connections. A host saves sets such as Family or Book club to reduce typing and sharing, without calendar access. Inclusion and the policies in decisions 21-29 are **DECIDED 2026-11-26**.

| Target flow | Happy-path actions once signed in |
| --- | --- |
| Invite a saved group | One tap in Who adds its roster and targets eligible connections when the plan is created. Review and creation remain separate. |
| Re-invite a past friend | 1-2 taps to select them from friends or recent connections. No account lookup or retyping. |
| Invite someone new | One share action for the dinner link. The guest signs in and joins; no separate friend request. |

Targeting means an invitation appears in the recipient's own Enkai invitation list, separate from joined dinners. It sends no email, push or message and grants no participant access. Share remains available for people who have not opened Enkai. Adding manual names sends nothing.

### Dinner connections and minimal identity

Create **host–guest connections only**, automatically on a successful authenticated link join after clear disclosure. A join proves joining, not attendance. Do not connect all attendees: that would tell guest A that B joined the same dinner and reveal B's identity, even when they are strangers. No connection is created on preview, failed join, cancelled dinner, self-join or mere targeting. Repeated joins are idempotent.

Both people see and can remove the connection. Use a quiet “You and Ana are now dinner connections” receipt, without notifications. Neither gains access to the other's list or history. Explain host name disclosure and participant roster visibility before joining.

| State | Meaning and transition |
| --- | --- |
| Pending | An optional historical suggestion or a future consent request; not selectable as an active connection. |
| Active | Eligible for repeat invitation after the disclosed join. Store separate endpoint acknowledgements and a creation policy version; automatic connection is not mutual friendship consent. |
| Removed | Either endpoint ends the connection for both. Hide it from both lists; repeated link joins do not silently restore it. Explicit consent from both can reactivate it. |
| Blocked | Effective state while either directional block exists. Never returned as a peer-visible reason. Unblocking leaves the connection removed. |

Display name only. The verified account string resolved by `canonicalAccount()` stays hidden: Google's subject, or Microsoft's linked Google subject or `microsoft:` subject. Spoofable names never authorize, merge or bind claims. Account linking atomically re-keys records, deduplicates pairs/memberships, preserves removals and applies stricter blocks without revealing aliases.

### Saved groups and the dinner roster

Ship private, creator-owned groups with **up to 11 other people**, fitting this design's 12-person dinner cap with the owner. Only active connections can be added. Each has a `required_default`, initially false; the organizer remains required. One tap expands account-targeted placeholders. Overlaps deduplicate by canonical identity; required wins conflicting defaults. Manual names remain unverified. Stop over-cap selections for editing; never silently drop required people or change N.

Creation copies this selection into the dinner's own versioned roster. Invitees still join, self-claim and, later, set up their blind delegates; a targeted identity restricts its claim to that account but does not auto-claim or accept. Required claims retain organizer confirmation. Freeze N and required flags under decision 2; missing invitees do not count toward quorum. Group edits affect future invitations only. Before blind delegates ship, the same picker supplies invitation placeholders without pretending blind agreement exists.

Members see **nothing about private group membership by default**, including the title or other names. They receive only “Ana invited you”, not “Book club invited you”. **Private saved groups ship first; shared, opt-in groups are a planned later extension.** In that extension, members consent to being visible and can leave; names-only visibility is limited to consenting members with authenticated, approved access. No account strings, attendance or scheduling status are shared. Consent withdrawal removes a name from that shared view; group size or hidden-name counts must not expose nonconsenters. Sharing never grants editing or invitation authority. The reserved `saved_group_shares` table, per-member name-sharing consent fields and endpoint consent on connections keep this path open without migration pain, honoring the product owner's 2026-11-26 condition that we can build on private groups in the future.

A private list is a host's address list, not an enrolled community. Provide “Stop inclusion in Ana's saved groups” from the connection screen without revealing which lists contain the person. It removes their entries from all Ana-owned lists and records an exclusion; Ana cannot re-add them without their consent. A shared group has a visible Leave action with the same no-readd rule for that group. Removing a member affects future plans only; deleting a group deletes its memberships and sharing grants, not connections or dinners. There is **no ownership transfer in MVP**: the owner deletes or recreates it. Any later transfer needs recipient acceptance and renewed member consent because it exposes a private list to a new owner; never auto-transfer on account deletion.

The participant roster consists of people who actually join and, in the agent phase, authorize their own delegates. Only participants see names and claims in that dinner; nobody receives the saved list's unjoined identities. The host sees its own invitation administration. Connections and saved groups store **no calendars, availability, private windows or constraints**. Membership grants no calendar access or acceptance authority. Group required defaults only seed the organizer's flags; they are not member consent.

### Remove, block, leave and report

Removing a connection clears bilateral selection and their entries in each other's owned groups. Each sees the person disappear, without a removal notification or reason. Other owners' lists are not exposed. A removed person may still use a valid dinner link; reconnecting needs explicit bilateral consent. Past dinner facts remain subject to dinner access and retention, never a social history feed.

Enforce blocks in **both directions** for new targeting, connection creation and joins through either party's host links. A blocked caller gets the same “This invitation is unavailable” outcome as an invalid or closed invitation, including status/body shape; previews stay generic for everyone. Do not reveal who blocked whom. Exclude the pair from group-derived targets and prevent new co-membership in third-party dinners when the other person is already a participant or target. Return only a generic selection failure, without naming the rejected person or pair. A blocked person's alternative account or an externally forwarded message cannot be reliably prevented.

A block removes their entries in each other's groups and suppresses future co-targeting in other owners' groups without disclosing those lists. Historical dinners are not rewritten and known names cannot be erased. For a shared active negotiation, invalidate outstanding authority and pause for generic roster review; never silently remove a required participant or lower quorum. Existing final plans remain historical facts, with no fresh targeting or social access. The blocker may leave an existing dinner through its normal versioned withdrawal rules. Blocking alone is not retroactive erasure or automatic cancellation.

Remove, block, stop-inclusion/leave and report must be available without contacting the host. Reports contain a reason code and optional short text, with an optional relevant dinner/connection reference. Warn against including calendar details; restrict evidence to the reporter and abuse reviewers, rate-limit reports, permit blocking immediately and offer review of restrictions. Never expose reporter identity or report status to the reported account. **Blocking and abuse controls MUST ship before any profile, discovery or offer feature.**

### New records and access (design only)

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
| `dinner_abuse_reports` | `id` PK; reporter; subject account; optional meal/connection reference; reason; bounded text; status/time | Reporter gets own receipt; restricted abuse reviewers handle cases. Retention is 90 days after closure, with documented limited holds. No availability evidence. |

Commands derive the actor from verified credentials or a verified remembered session and resolve canonical identity; never trust a payload account. Under a transaction, check block/exclusion state, dinner validity and identity before joining, creating a connection or copying targets. Enforce these rules on all mutation paths, including legacy `join`, retries and account linking. Social lists use separate allowlisted responses; never enrich meal `list` or broad `details` with connection/group records. Delete groups/members on owner deletion; keep only the minimum block/abuse records for a documented retention purpose.

### Leakage review

`list-connections` returns only the caller's own connections, with display names and opaque relationship handles. No arbitrary account search, other people's groups, shared-contact counts or block reasons. Group invitations reveal only the host until the recipient joins and accepts participant-name visibility. Keep previews, share text and codes free of group identity and roster data; `group-finder.js` remains restaurant search, not people discovery.

Use neutral outcomes for forbidden, missing and blocked resources, bounded pagination and comparable response timing. No enumeration by invite code, name, email or phone. Design limits: 20 new pair creations and 50 target additions per account/day, 10 join attempts/minute per account plus coarse IP abuse limits; repeated joins never consume another connection creation. Bound group edits and apply server-side limits as well as UI caps. Generic failures still allow inference from outside knowledge; do not promise block secrecy against repeated real-world observation. No social data in analytics, previews or calendar provider calls.

### Migration and minimal UI

| Past-dinner option | Consent and usability |
| --- | --- |
| A. Silent backfill | Easy but creates unexpected relationships and treats an old join as new consent. Reject. |
| B. Optional suggestions | **Selected 2026-11-26.** From `meal_plans.owner` and canonical `meal_plan_members.account`, suggest host–guest pairs only. Each sees only people from their own prior dinners; require both to confirm before activation. No notifications. |
| C. New joins only | Least historical processing but loses repeat-invite convenience. Keep as fallback for people declining suggestions. |

Backfill never uses response/attendance JSON or creates attendee-to-attendee edges. Exclude self-pairs, removed/blocked accounts and opted-out history; expire suggestions after 90 days. Existing invite UUIDs and 22-character links keep working. New joins through old links use the disclosed new policy, with an explicit join confirmation for already signed-in visitors; no silent connection creation just from navigating a hash. Current `finishSignIn()` auto-join must respect that boundary.

Offer a separate device-local import of `state.people` as optional name suggestions. Keep them local until the host chooses an existing real connection to match. Never auto-bind names, `guests`, `attending` or wish-interest names to accounts. Dismissal keeps current name-only planning usable; shared-device names must not silently attach to whoever signs in next.

Keep UI changes small: add **From friends and groups** above manual names in Who; replace Saved guests within Settings' Planning card with **Friends & groups** and accurate account-storage copy. Provide a connection list with remove/block/report and stop-inclusion, a group editor, and share/leave controls only when applicable. The join landing states “By joining, you and Ana become dinner connections. Either of you can remove this any time.” Show a quiet post-join receipt, not an alert campaign. The home dinner card is unaffected by this slice; phase 1's privacy corrections still apply. Invitation lists stay separate from joined dinners.

### Effort and future-compatibility note

Estimate **2-3 developer-weeks**, including permissions, abuse handling and review. Four sub-slices (identity/join, groups/targets, blocking/privacy, import/UI) each take roughly 0.5-0.75 week and 2.5-5 hours of Codex-plus-reviewer loops: **10-20 wall-clock loop hours** total. Assume 5-6 minute Codex runs and 2-4 review rounds per sub-slice, plus human review and verification. Depth, findings and reviewer availability can substantially extend elapsed time; this is not a delivery promise.

Future-compatibility note: separate endpoint consent allows mutual opt-in later without replacing connection identity. Blocking and abuse controls come first. Photos, profiles, messaging, and restaurant-interest or dating-like offers are far future, out of scope and not designed here. Phone/email address-book matching is also later, not MVP: it can reveal who uses Enkai, uploads contact hashes that may be guessable, and needs explicit uploader consent, protections for nonusers, opt-out and deletion.

## 4. Trust boundaries, storage and execution

**Scope after decision 30:** this section specifies the long-term blind delegates. The interim central runtime, shared credentials and ballot/result retention are explicitly allowed by [section 2A](#2a-interim-stage-central-scheduling-agent-with-a-per-person-upgrade-path). They do not satisfy this section's operator-privacy boundary.

### Where delegates run

| Placement | Benefits | Costs / actual trust |
| --- | --- | --- |
| Browser / native iOS | Data remains with owner; no shared calendar decryption key. Native secure storage strengthens credential custody. | Browser suspension/offline people delay rounds; iOS background execution limited. Bounded reads reduce battery. XSS/extensions or malicious operator-delivered JavaScript can steal data; native releases also require supply-chain trust. |
| Conventional per-user server/container | Always-on, simpler OAuth, low coordination latency. | RLS/process isolation protects users from peers, not administrators/host/debug/backups. Operator can technically inspect memory/tokens or alter code. **Fails requirement.** |
| Per-user attested sandbox/enclave | Offline negotiation with encrypted owner storage and verifiable measured code can reduce operator access. | Needs attestation, owner-controlled key release, rollback protection, isolated observability, patching/side-channel analysis. Ordinary “sandbox” is not this boundary; higher cost. |
| Hybrid progression | Manual-local now, native connector next, optional attested delegates later. | Same protocol/limits throughout; no silent server fallback reading calendars. |

**On-device MVP, accepted 2026-11-26:** start with manual private inputs in the browser, then add one verified local connector, preferably native iOS. Delegates operate while the owner has the app open; offline means unknown, never rejection or acceptance. Bound calendar reads and use 15-minute scheduling ticks while active, without always-on polling. Reminders remain manually sent drafts.

Today `refresh_cipher` uses shared `CALENDAR_ENCRYPTION_KEY`; `accessToken()` decrypts server-side. Callback storage, rotation, conflicts and sync permit operator access. Local credentials need native secure storage or memory-only short-lived browser tokens without a secret-bearing proxy. Identity sign-in stays separate. Unverified provider support requires manual fallback; server connections cannot be promised reusable.

Select calendars explicitly and verify they belong to the owner; consent is session/horizon-bounded and revocable. Reuse the intent of existing overlap/all-day/DST handling and own-dinner exclusion locally, but treat partial pagination, unsupported sources and provider failure as unknown. Never use another member's token or provider free/busy lookup. Source calendar providers necessarily hold their customers' calendars; they are owner-selected sources, not an Enkai negotiation coordinator. Enkai must never send them another participant's private inputs.

One active owner per delegate/device profile: account switching purges old raw caches before another owner's calendar can be read; never combine accounts in one vault or background task. Browser profiles with shared origin access are a weaker isolation boundary than native owner-scoped storage. MVP must not support simultaneous different-person delegates in one browser profile; owner-device compromise remains a stated limit.

Full-product privacy requires revoking legacy broad grants and retiring shared read/sync workers **globally**. Verify provider revocation and backup expiry; deleting ciphertext is insufficient. Shipped disclosures cannot be undone.

### Storage design, not schema implementation

| Location / conceptual record | Allowed contents and lifetime |
| --- | --- |
| Shared `groups`, `group_members`, delegate key bindings | Per-dinner group, frozen roster/required flags, canonical identities, claims/key epochs. Seeded by section 3's distinct `saved_groups`; no availability or inherited authority. |
| Shared `negotiation_sessions` | Meal link, public dinner envelope/duration/zone, policy/roster version, seed, round/deadline, coarse state. No private windows, response vectors or scores. |
| Shared `negotiation_envelopes` | Routing, opaque ID, fixed-size ciphertext/expiry. Type encrypted. Delete on delivery acknowledgement, hard TTL 24 hours; no body logs/replay archive/backups. Redelivery is same valid answer, not another query. |
| Shared budgets / receipts | Canonical owner, public target week, charged query/counter permits, opaque nonce/expiry/minimal outcome; no answer/body hash. Week plus 30 days for anti-replay/abuse. |
| Shared `negotiation_events` | Creation/cancel/finalize, policy/key epochs; no intermediate answers, candidate outcomes or private reasons. Retention is 90 days. |
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
| E2EE relay | **Selected 2026-11-26.** Hides intermediate semantics from relay/database readers. Adds verification, device recovery, padding/review costs. Relay still sees routing/activity/size/timing/session and final certificate. It relays every accept/reject ciphertext, without labeling/decrypting the type. |
| Private set intersection | Ordinary PSI can reveal all common times; repeated subset queries still probe. Multi-party/quorum/malicious-query handling is additional work. Defer; revealing all intersections conflicts with minimization. |
| MPC | Could release one qualifying slot/certificate without individual answers even to peers. Requires reviewed malicious-secure protocol, authenticated inputs, collusion threshold/dropout handling. Outputs still leak. Deferred under the accepted bounded-disclosure policy; stronger guarantees need separate research. |
| Homomorphic encryption | Can hide inputs in computations; quorum/selection/key custody/output release still need a protocol, often threshold decryption/MPC. Complexity/review unjustified for MVP. |
| TEEs / confidential computing | Possible later always-on delegates. Separate attested owner environments only, never one common enclave collecting calendars. Trust hardware/attestation/code delivery; rollback/side channels remain. |

These assessments do not verify providers or libraries. Use **no LLM in MVP**, as accepted on 2026-11-26. The specific model/provider remains unselected because the MVP uses no LLM; this is the sole open point and does not block the MVP. Later local parsing uses only its owner's input. No cloud calendar, transcript or private-constraint prompts, including across requests.

## 5. Negotiation protocol and disclosure limits

**Stage boundary:** this is the later blind protocol. Section 2A uses its exact-plan propose/answer contract now, with the organizer's saved candidate order and interim run limits. Its server delegates do not implement this section's E2EE, rounds, signatures or per-owner leakage budget. The upgrade adapter must honor those limits rather than expose whole answer vectors.

A public dinner envelope expresses the invitation, not anyone's free time: destination zone, maximum seven-day horizon, broad meeting hours, duration, venues and frozen roster. An organizer's personal window stays local. Stable joint-plan digests cover exact time, duration, IANA zone/DST occurrence, venue and policy/roster version.

**MVP protocol — DECIDED 2026-11-26:**

1. Freeze N, required people and policy. Guests pick their placeholder within **Set up my delegate**, sign in and authorize bounded conditional exact-plan acceptance. Optional claims bind immediately; required claims need organizer confirmation. Organizer sees claims/undo/disputes, not scheduling answers. One canonical account per slot; unbound required people block agreement. Constraints/grants never accompany claims.
2. Commit a public seed and candidate-generation rule. A rotating delegate publishes **three** plans per round from a 30-minute grid inside the public envelope, independent of its private calendar. Every delegate independently recomputes the seeded candidate set, order and designated exact test, including any permitted counter inputs, and rejects and flags a proposal that differs from the rule. The proposer cannot smuggle in its own free times or target a particular person with a chosen probe. Venue choices and evidence are public; unknown hard suitability needs owner confirmation. No private preference score leaves a delegate.
3. At a fixed tick, each active delegate evaluates the whole batch locally and emits **BATCH_ACCEPT** (“one or more acceptable”) or **BATCH_REJECT** (“none acceptable or not authorized/known”). No subset, reason or source status. Encrypted messages reach participant delegates, not human views. Positive batch replies do not establish a common slot.
4. Test **one** designated candidate from that batch, using a public deterministic index independent of private answers. Each delegate signs exact-plan **ACCEPT** or sends undifferentiated **REJECT**. ACCEPT authorizes conditional attendance, not booking/calendar writing. Missing replies stay unknown. Owners may privately require confirmation before signing; other humans see no confirmation state. Free/busy alone is never willingness.
5. Each delegate has **one fixed COUNTER phase for the entire budget period**, immediately after its first charged exact test: one of four predeclared broad subranges, or no counter. Sending no counter spends the permit; the owner cannot defer to another round/session, which would encode extra information through timing. Each range contains at least six candidate starts; disable counters if the envelope cannot support four such coarse regions. Meaning: “try this search region”, never “I am free throughout it”. Remaining candidates follow the seeded rule with these encrypted, delegate-shared hints as inputs; no secret ranked list, exact private counter or free text. Every recipient of resulting proposals already receives the counter, so deterministic expansion adds no new private choice. Counter influence is accounted for rather than hidden in ordering.
6. A participant delegate assembles required-plus-quorum exact-version signatures. This endpoint processes allowed messages, not calendars. Batch replies never substitute for exact approval. Organizer privately reviews/approves the exact plan; the relay then verifies final signatures and atomically publishes agreement. No partial certificate or failed-candidate count reaches humans/server. Signatures expire after five minutes and require owner-local checks within those five minutes. Unknown/stale coverage requires private manual confirmation. If terminal freshness/withdrawal fails, stop; no refresh oracle.
7. Three rounds or deadline end with “No slot yet”. Default deadline: 48 hours, at least 24 hours before dinner; shorter notice explicit. No time runoff, winning tally, ranked coverage or named veto. Extensions/reopens/roster edits never replenish budgets. Owners may change public invitation, privately amend their limits, or abandon; nobody waives another's constraint. A feasible slot may remain undiscovered.

Required people must accept; optional nonapprovers are neither counted nor going, and their private vetoes do not block the entire dinner, as accepted in decision 2 on 2026-11-26. No silent N/required-flag changes. Hard constraints govern only their owner's participation under the accepted policy.

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

Spending all three rounds on Saturday dinner leaves Ana no fresh permits for another dinner that week, even if everyone has time. It may end with “No slot yet”. The product owner accepted this weekly limit and its usability trade-off in decision 15 on 2026-11-26; the pilot must test tolerance for blocked second or third invitations.

Also: at most one new session round/hour and three active sessions/owner; no questions on refresh. Use padded fixed-size envelopes at 15-minute phase ticks while active, fixed control/counter fields, fixed delivery windows and no public arrival acknowledgements. Each tick opens a short fan-out window (target 30 seconds), not a 15-minute delivery hold: exact signatures must reach finalization within their five-minute validity. Otherwise expire/fail closed without silently re-signing. Offline devices still reveal absence to relay; no battery-intensive always-on cover traffic is promised. Local scheduling activity and packet timing must not be driven by when a private event ends.

Decision 8, accepted on 2026-11-26, uses unnumbered status everywhere. The product owner's earlier example, “waiting on 2 people”, is excluded because subtraction from known answers can identify who answered. No per-slot reason, named failure, private-score explanation, partial quorum, calendar freshness or coverage belongs in shared state. Calendar-dependent ordering, retries and errors add side channels and are forbidden. Online/lifecycle metadata and final output remain outside the ten-bit calculation. This is neither differential privacy nor a formal non-reconstruction guarantee: even one bit can be decisive with auxiliary knowledge. Exhaustion fails closed, without automated new-session workarounds.

### Match rate and the privacy trade-off

No typical success rate is measured. Nine candidates yield only **three exact tests**; nine tests need different permits and a larger budget. Batch acceptance does not identify a workable time.

For a rough four-person illustration, assume a 90-minute dinner, a 30-minute grid, two required people and a three-person quorum, one venue, counters disabled, and all devices online. A four-hour evening has six valid starts. If one or two starts meet quorum, three distinct uniformly seeded exact tests find one with probability **50% or 80%**, respectively. Over seven such evenings there are 42 starts; if only those same one or two starts work across the week, the chance falls to **about 7% or 14%**. This assumes scarce shared time; if every evening has feasible starts, the broader horizon need not reduce success. With no feasible start, success is zero; offline devices, private refusals and expiry also reduce it.

These are sampling estimates, not observed outcomes. Nine distinct exact tests exhaust the six-start grid and raise the 42-start case to **21% or 39%**, at greater disclosure and permit cost. Calendars determine feasibility; counters change sampling. Validate success and repeated-invitation tolerance during the pilot under decision 15's accepted budget.

### Worked example: Ana, Bruno, Caio and Dani

Ana selects Family in Who with one tap, seeding Bruno, Caio and Dani with Bruno required. Their earlier joins through Ana's dinner links automatically created these host–guest connections after disclosure. She creates Saturday dinner in Pinheiros, São Paulo (`America/Sao_Paulo`), 90 minutes, public envelope 18:00-22:00, N=4, herself/Bruno required; threshold three. Mesa Verde is fictional; Bruno privately confirms vegetarian suitability. Creation targets the connections; Ana also shares the existing link. Selection, creation and sharing are actions 1-3.

Guests sign in, join through the link and claim their places during setup; Caio and Dani bind immediately. Disclosed link joins automatically create host–guest connections for new friends; these three already have connections, so this join reuses them without duplicates or guest–guest edges. Ana confirms Bruno's required claim (action 4). Ana and Bruno privately allow 18:00-22:00; Bruno confirms dietary suitability. Dani allows 19:00-22:00. Caio has an overlap until 19:00 and allows dinner through 22:00. These limits stay on their devices. Caio uses a supported local connector or manual private limits. No server connection is read.

Round one's publicly seeded batch is 18:00, 18:30 and 19:00, with 18:30 designated. Ana sends BATCH_ACCEPT and exact ACCEPT. Bruno sends BATCH_ACCEPT and exact ACCEPT. Caio sends BATCH_ACCEPT because 19:00 works, then exact REJECT for 18:30. Dani also sends BATCH_ACCEPT because 19:00 works, then exact REJECT for 18:30. Two exact approvals cannot meet the three-person quorum. Peers learn those bounded bits, without intervals, titles or reasons. Humans see “No slot yet”, without counts or named answers. This narrow envelope disables counters.

Round two's 19:30, 20:00 and 20:30 candidates come from the public seeded rule, **not anyone's calendar**; counters remain disabled. The designated plan is 19:30-21:00 at Mesa Verde. Ana sends BATCH_ACCEPT and exact ACCEPT; Bruno sends BATCH_ACCEPT and exact ACCEPT; Caio sends BATCH_ACCEPT and exact ACCEPT, each within grants after fresh local checks. Dani closes her browser before either reply: both results are unknown, despite her private window allowing these times. Silence supplies no approval. Humans are not told whether she is busy, offline or unwilling; the relay observes her device stopped sending. Quorum is reached, so round three does not run.

Ana privately reviews and presses **Approve and finalize** (action 5). Final certificate has Ana/Bruno/Caio's valid signatures: both required and three-person quorum. Relay publishes **Saturday 19:30-21:00, Mesa Verde, Pinheiros, America/Sao_Paulo**. Dani sees final slot and own “Unconfirmed”, no “3 of 4 approved”, past choices or “Caio rejected 18:30”. Later she may approve unchanged final plan within remaining budget, or manually confirm attendance without a calendar query. Late attendance does not reopen agreement.

Conditional attendees carry forward without another RSVP. Calendar entry is optional/local; reservation is **Not reserved yet**. The saved roster took one tap. This example has five coordination actions including the optional share; guest setup, constraints and failed rounds add effort. Do not promise two taps for the whole dinner or background convergence.

## 6. Authorization, relay operation and audit

These relay rules apply after the blind-delegate upgrade. Section 2A governs interim server matching; retain its actor checks, in-memory-only computed answers and prohibition on logging private inputs.

Design commands: session start/claim, key bind, envelope relay, final-agreement publish and cancel. Private delegate input/grant/revoke has no shared constraints endpoint. Relay schedules delivery/deadlines, never private recommendations/calendar reads. No synthetic-host impersonation or worker intersection.

Authenticate canonical accounts separately from delegate keys. Bind session, policy/roster/key epoch, exact digest, scope, sequence and expiry to signatures. Owners grant response/conditional-attendance authority only; organizer alone finalizes manually. No delegate changes another's constraints/budget. Required claims pending confirmation cannot count; contested/duplicate claims cannot displace binding. Preserve one slot/account and N under undo/linking/transfers; names/email alone establish no quorum identity.

Deny direct table access from browsers and anonymous callers. Narrow commands check identity, membership, visibility, message structure, ciphertext size, permits and cancellation. The service role bypasses row-level security (RLS); RLS cannot keep calendars private from operators. Under consistent locks, check cancellation, revisions, key epochs, expiry, and distinct required and quorum membership. Publish the final agreement, dinner projection and minimal receipt atomically. Never make provider calls inside transactions or centrally “refresh everyone's availability”.

Opaque idempotency IDs; same ID/different payload rejected. Receipts never retain answers or dictionary-attackable yes/no hashes. Retry transport only within expiry/permit. Cancellation/revocation fences pending sends; key/member changes invalidate approvals. Policy changes cannot rescue stale signatures. Released final commitments remain known after deletion.

Exclude tokens, private data, plaintext messages and candidate outcomes from logs/analytics/support/traces/error reports/backups/model prompts. Keep only bounded coarse lifecycle/abuse metrics; no named bottleneck/response-time leaderboard. Review with synthetic calendars. Measure effort/return use without mining choices.

Private consent revocation or provider disconnect prevents further local reads/acceptance, clears credentials/cache and invalidates unsent authority. Revoke the shared signing grant/key epoch generically, without identifying a calendar or private policy. Optional attendees can withdraw without a reason; required/final commitment withdrawal reopens or cancels under explicit policy. Published commitments cannot be erased from peers. Saved-group leave/export/delete preserves these boundaries; admins inherit no vault access.

## 7. Dinner-state integration and human visibility

**Amended 2026-11-26 (interim stage):** section 2A supplies `agentResult`, works/none states and explicit manual Host choice through `manage`. The no-override rule and signed agreement below are the later blind flow. Going-only disclosure, hidden peer answers and reservation meanings apply to both. Interim own conflict notes say Busy; existing optional calendar sync remains with provider disclosure.

The versioned `meal.negotiation` design contains coarse state, public policy/roster epoch, final agreement, capabilities and own action requirement. No peer responses, scores, time aggregates, ties, named pending people, coverage/read timestamps. Owner-local data combines on device, never inside shared meal JSON.

Keep `derive()` pure with supplied `now`, cancellation first and stable reservation labels. Add negotiation-aware states such as `negotiating`, `needs-own-action`, `ready-for-own-review`, `finalized`, `expired`. Hidden responses do not imply zero votes. Update planner dispatch/home/details/mobile receipts together; unknown action IDs currently fall toward organizer controls. Restaurant rules require their own projection.

The organizer sees no other person's time answers, counts, named waiting or rejected people, and has no override. Roster administration is separate. Owners can see their own local conflict details. Disclose final **affirmative participation only with explicit consent**, where needed for dinner, never named tentative or declined replies or their history. The relay necessarily knows certificate signers; people may infer willingness for the final slot. The product owner accepted this exception on 2026-11-26; each participant's explicit consent is still required.

Edits to the schedule, duration, zone, venue or roster require a new exact version and local approval; old time ballots cannot authorize them. Preserve current reconfirmation intent (clear `confirmedSchedule` and `calendarAccept`, invalidate reply hashes, request reconfirmation), without shared reconfirmation lists. Attendance is separate from calendar writing and email sharing. Existing `syncDinner()` must not run here. Use owner-local ICS or private entries. Agreement never sets `Booked`; reservation values `Unbooked`, `Booked`, `Confirmed`, `In-person booking only` retain their meanings.

## 8. Compatibility, retirement and rollout

**Amended 2026-11-26 (interim stage):** retain the first-half privacy fixes already done locally, time polls, private plaintext ballot writes, calendar connect and the existing `manage` final OK/manual host choice. Add section 2A's central agent, title-free reads, probing controls and purge. Do not disable these retained paths under this section's later retirement instructions. The [phase 1 finalization proposal](privacy-phase1-finalize-proposal.md) is superseded. Global retirement below is an exit condition for the long-term operator-private architecture, not the interim phase 1 release.

Keep dinner IDs, invite UUID/hash links, 22-character codes, static redirects and manual reservations. Successful disclosed joins also create section 3's host–guest connections, never automatic saved-group membership, delegate keys or calendar consent. Guard cancelled/blocked joins and require disclosed confirmation before current auto-join paths. Public previews stay generic.

Close shipped paths first: remove time answers/counts from every read/cache, disable plaintext time ballots/host bypass, then delete historical time-answer JSON with backup policy. Preserve identity/restaurants/legitimate final dinner facts, not vote timelines. Never backfill calendars or old ballots into delegates. Imported final plans are “legacy host choice”, not fabricated approval.

Flags can stage storage/read/relay/local-calendar rollout, never permit old-client fallback exposing votes/shared conflicts. Reject incompatible requests with upgrade requirement. Clear/version sensitive old drafts/storage on upgrade/logout/account switch. Opted-in meals have one finalization authority; `manage` cannot remain a writable time bypass.

Retire operator-readable broad grants globally before full compliance. Otherwise release only a bounded local pilot and explicitly acknowledge legacy conflict. Old event deliveries/chat caches/recipient copies cannot be undone. Rollback pauses negotiation/preserves final agreement; it never restores central reads, snapshots or time-vote exposure.

## 9. Phases and effort

Developer-weeks include UI, validation and rollout. Loop hours assume 5-6 minute Codex runs, 2-4 reviews per sub-slice, reading, verification and fixes. They exclude waiting, external reviews and pilot observation, which can add weeks. This design revision claims no application tests.

| Phase | Developer-weeks | Rough loop hours | Scope and exit criteria |
| --- | --- | --- | --- |
| 1. Privacy fixes + interim central agent | 3-4 | 16-28 | First-half fixes are done locally: list projection, Going-only attendance, previews without time, anonymous organizer-only restaurant totals. Add section 2A's delegate interface, deterministic matcher, title-free reads, organizer final OK, quota, invalidation and purge. Keep polls/calendar connect. Exit: only coarse scheduling results to host, no peer answers/counts; no claim of operator-private blind negotiation. |
| 2. Friends and saved groups | 2-3 | 10-20 | Section 3: disclosed joins, identity, private groups/targets, block/report, optional import; add per-guest required placeholders to the interim eligibility rule. Exit: repeat-invite targets met, neutral block behavior, no roster/calendar leakage. No blind delegates required. |
| 3. Device delegates and relay upgrade | 3-4 | 16-30 | Replace ServerDelegate with DeviceDelegate; move matcher to rotating participant, add local vault/grants, signed keys, frozen claims, E2EE transport, bounded protocol and certificates. Keep eligibility/result/UI contract. Exit: worked example including offline failure, no server-visible answers; legacy ballots purged and shared scheduling grants/read/sync paths retired before a full-product operator-private claim. |
| 4. Review and pilot | 2-3 | 12-24 | Independent crypto/privacy review, probing, budgets, deletion/backups, concurrency and old clients. Exit: observed behavior matches accepted leakage contract, including social permissions. |
| 5. Hardening | 2-4 | 10-20 | Account isolation, recovery, accessibility, operational minimization and pilot fixes. Exit: failures/rollback never restore privacy leaks. |
| 6. Optional local calendar | +3-5 | +16-30 | One device-only provider path; coverage, DST, staleness and revocation. Exit: shared service cannot obtain tokens/events; manual fallback. |

**Totals: phases 1-2 need 5-7 developer-weeks and 26-48 loop hours; through phase 5, 12-18 weeks and 64-122 hours; with phase 6, 15-23 weeks and 80-152 hours.** Phase 1's whole-slice estimate includes roughly 1 developer-week / 4-8 loop hours for the first-half work already done locally, plus 2-3 developer-weeks / 12-20 loop hours for the remaining interim agent and review. Done locally does not mean deployed or rollout-verified. Review depth affects these estimates. Title-free shared `checkConflicts()` supports the interim contract but cannot provide operator-private calendars. Other providers, attested delegates, MPC, memory, communities and booking need separate estimates.

Interim exit checks cover option order/first eligible, exact ballot-plus-calendar semantics, missing ballots/provider failures, roster snapshots, stale-result invalidation, concurrent six-run quota, minimum group gate, single-option behavior, host choice/reconfirmation, organizer-only projection and cancellation/past-dinner purge. Inspect synthetic responses/storage/logs for peer answers and titles. These are implementation acceptance criteria, not tests run by this documentation edit.

Implementation checks need synthetic network/server-boundary inspection, not only UI snapshots: no raw calendars/answer vectors in relay/storage/telemetry; TTL/key recovery/substitution; budget replay/resets across devices/sessions/overlapping weeks; malicious proposals; logout/XSS; required identity/quorum; stale signatures/double-finalize/cancellation; late replies; DST/all-day handling; incomplete coverage; preview/chat leakage. Preserve useful reservation/restaurant behavior within the new contract.

## 10. Risks and residual leakage

For the interim stage, the server holds ballots and decryptable credentials; section 2A documents that operator access, provider copies, quorum-bit/first-match inference and the limits of a per-dinner run cap. The mitigations below describe the later blind system and must not be advertised as interim guarantees.

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

The interim product can demonstrate that hosts cannot inspect peer time ballots, with a limited result and verified deletion. The stronger long-term privacy claim also requires demonstrating that operators cannot collect calendars. Reviewed message limits, owner-held keys, inspectable protocol, deletion and honest offline behavior can earn returning-group trust. Removing titles alone cannot establish that stronger claim.

The **saved groups and connection graph are the compounding asset**: each consented repeat connection and useful saved roster makes the next dinner easier. It is defensible only if members value that convenience and trust the privacy controls; stored names alone are no moat. Keep removal, consent, export and deletion practical rather than relying on lock-in. Measure repeat use, setup actions saved and successful dinners without mining calendar patterns, rejection histories or named failed-slot logs. Consented restaurant experiences and verified venue relationships may add value later; Places ratings prove neither capacity nor partnerships.

## 12. Product decisions

The product owner accepted decisions 1-29 on 2026-11-26 ("Yes and accept and start"), then approved central-agent-first delivery in decision 30 that same day. All are **DECIDED 2026-11-26**, with numbering preserved. The short amendments below scope the interim exception; the earlier wording remains the long-term intent. Decision 30 and section 2A govern conflicts during the interim stage. Phase 1 precedes friends/groups; private saved groups still precede their planned shared, opt-in extension. The specific LLM model/provider remains unselected because no LLM is used and does not block delivery. These are accepted design decisions, not claims that the agent is implemented.

1. **Audience — DECIDED 2026-11-26:** private friend groups of 2-12; workplaces/open communities deferred.
2. **Quorum — DECIDED 2026-11-26:** require all required people, including the organizer, plus `max(required_count, ceil(2*N/3))` distinct exact-version approvals. Freeze N/placeholders/required flags; silence never counts. Optional nonapprovers simply do not attend; each owner authorizes their own participation, and an optional private veto does not block the entire dinner. Replaces the all-included-hard-constraints feasibility check; no central checking remains. **Amended 2026-11-26 (interim stage):** Use the same eligibility formula centrally, with organizer-only required status and all joined members frozen at check time; phase 2 adds per-guest required placeholders (section 2A).
3. **Finalization — DECIDED 2026-11-26:** human organizer approval-and-finalize; bounded delegation later. **Amended 2026-11-26 (interim stage):** Host final OK uses existing manage; manual selection remains available as Host choice, without fabricated agent approval.
4. **Calendar launch — DECIDED 2026-11-26:** ship a manual-local MVP first, followed by a gated local-calendar pilot (+3-5 person-weeks). Replaces the former server-connected-calendar MVP (+1-2 weeks); old broad tokens/read functions cannot be reused. **Amended 2026-11-26 (interim stage):** Keep calendar connect and server-side title-free free/busy checks now; device-only custody remains the later goal (section 2A).
5. **Durable groups — DECIDED 2026-11-26:** add invite-link connections and saved groups before blind delegates. This supersedes the earlier durable-group deferral. Saved groups seed separate per-dinner groups, never automatic membership or delegate authority. Their accepted policies are recorded in decisions 21-29.
6. **Memory — DECIDED 2026-11-26:** use local-only, session-default memory in the MVP, with editable per-group opt-in later and no account-wide memory without consent. Replaces evaluator-readable constraints/preferences; never retain peer rejection patterns.
7. **Ties — DECIDED 2026-11-26:** use no time tally, tie or runoff; stop after three blind rounds with coarse failure if no agreement is reached. Replaces the former one-runoff policy within three rounds. No automatic/host-weighted winner. **Amended 2026-11-26 (interim stage):** Select the first eligible option in saved public order; never rank by counts. The three-round limit belongs to later blind negotiation.
8. **Visibility — DECIDED 2026-11-26:** show final slot, unnumbered coarse status and own local data only. “Waiting on 2 people” plus known answers can identify respondents even in larger groups; counts would need a revised budget. Replaces “aggregates plus own answer”. **Amended 2026-11-26 (interim stage):** Host sees only works with one proposed time or none, plus the chosen plan; guests see own answers and final plan. No availability counts, names, per-time outcomes or partial quorum. Section 2A defines neutral waiting/retry states.
9. **Booking — DECIDED 2026-11-26:** coordination/manual reservation recording; holds/payments/bookings deferred.
10. **Retention — DECIDED 2026-11-26:** use section 4's minimal local/answer-free retention: five-minute exact-answer expiry, round-close deletion, acknowledgement deletion/24-hour relay ceiling, 15-minute memory-only cache and dinner-plus-30-day final evidence. Constraints expire dinner plus 30 days; answer-free audit retention is 90 days; persistent memory requires opt-in. No indefinite ciphertext backups. **Amended 2026-11-26 (interim stage):** Purge response.times and computed availability on cancellation or finalized-and-past; free/busy and computed answers are memory-only per run. Delete coarse results with the dinner or by dinner end + 30 days; see section 2A purge schedule.
11. **Reminders — DECIDED 2026-11-26:** manual drafts now, opt-in delivery later; no background notification promise. Drafts must not name scheduling bottlenecks.
12. **LLM — DECIDED 2026-11-26:** use no LLM in the MVP; delegates are deterministic. The specific model/provider remains unselected because no LLM is used in the MVP. This is the sole remaining open point and is not blocking. Replaces optional capped small-model parsing/explanations; shared models cannot receive multiple owners' calendars across calls.
13. **Claims — DECIDED 2026-11-26:** use explicit self-claim, immediate optional binding, required-only organizer confirmation and visible undo/disputes; one account/slot. Friends/groups seed targeted placeholders; targeting is not joining or approval. Private inputs stay local; claims confer no calendar access. Targeting and block details follow the accepted policies in section 3 and decision 25. **Amended 2026-11-26 (interim stage):** Before phase 2 placeholders, count actual joined canonical members plus the organizer; name lists are not required-person claims.
14. **Runtime/operator trust — DECIDED 2026-11-26:** run delegates on the owner's device; ordinary server isolation fails the requirement. Replaces shared evaluator/workers; full-product privacy requires legacy token/read retirement. **Amended 2026-11-26 (interim stage):** Accept the central ServerDelegate and shared encrypted refresh tokens temporarily. This does NOT satisfy the long-term no-central-component requirement; DeviceDelegate replaces it later.
15. **Protocol and leakage budget — DECIDED 2026-11-26:** use bounded negotiation with three batch permits, three exact permits, one counter and one terminal check per owner/target calendar week across all sessions, within section 5's ten-bit content budget. Pilot this limit and test tolerance for blocked second/third invitations; never replenish silently. Three rounds test three exact plans, not nine. More tests improve section 5's illustrative 7-14% broad-horizon success but exceed the ten-bit baseline at nine exact tests. Replaces central scoring/time votes. Zero endpoint compatibility-bit disclosure needs stronger computation and re-estimation. **Amended 2026-11-26 (interim stage):** Interim public first-match selection uses a six-run dinner/day cap and minimum two other joined participants. Quorum/first-match inference remains; the blind ten-bit per-owner budget is not an interim guarantee.
16. **Encryption/keys — DECIDED 2026-11-26:** use reviewed E2EE with independent key verification and no server escrow, accepting recovery/offline costs. Plaintext relay would reveal every answer/slot to the relay, outside the accepted contract. **Amended 2026-11-26 (interim stage):** E2EE remains the blind transport goal; interim answers stay inside server-run memory and existing ballots remain centrally stored until purge. Shared-key token encryption does not hide credentials from the operator.
17. **Restaurants — DECIDED 2026-11-26:** retain standalone restaurant-only aggregates with consent and voter names hidden by default; time-linked answers get scheduling protection. Replaces the uniform time/restaurant aggregate policy. **Amended 2026-11-26 (interim stage):** Keep existing anonymous organizer-only standalone restaurant totals while undecided; never expose time-linked totals.
18. **Final attendance/previews/writes — DECIDED 2026-11-26:** keep final time participant-only, disclose positive attendance only with explicit consent and use private calendar entries. No named negative RSVPs. Replaces public selected-time previews/shared attendance/server sync; the relay still sees final signers. **Amended 2026-11-26 (interim stage):** Keep previews without time and Going-only affirmative attendance. Existing optional calendar sync/connect stays, with honest provider attendee/email/reply disclosure; private device entries remain the later goal.
19. **Legacy rollout — DECIDED 2026-11-26:** ship phase 1 privacy closure first, independently of delegates, with global retirement of legacy disclosures and a privacy-safe rollback. Replaces untouched legacy time-poll behavior. IDs and links stay; incompatible clients upgrade. **Amended 2026-11-26 (interim stage):** Phase 1 is first-half privacy fixes (done locally) plus the central agent. Keep private time polls, calendar connect and manage approval; defer global retirement until the blind upgrade. The separate retirement-first proposal is superseded.
20. **Delegate acceptance authority — DECIDED 2026-11-26:** use bounded local conditional-attendance grants with optional human confirmation. Explain expiry, constraints, budget and revocation first. Replaces mandatory **Approve and attend** per proposal; organizer finalization stays human. Joining, saved membership or calendar connection never grants acceptance authority. **Amended 2026-11-26 (interim stage):** A poll yes, join or calendar connection is scheduling input only, not a signed attendance grant. Preserve explicit final RSVP/consent and host final OK.

21. **Connection scope — DECIDED 2026-11-26:** create host–guest connections only; all-attendee edges would expose identity and shared-dinner participation to strangers.
22. **Connection visibility — DECIDED 2026-11-26:** both endpoints can see and remove the connection, with quiet receipts and no notifications; no peer list access.
23. **Backfill — DECIDED 2026-11-26:** offer bilateral-confirmed historical suggestions (option B), with new joins only (option C) for people declining suggestions; names never bind automatically.
24. **Saved-group sharing — DECIDED 2026-11-26:** private saved groups ship first in the MVP; shared, opt-in groups are a planned later extension. Members must consent to being visible and can leave; names-only visibility is limited to consenting members with authenticated, approved access, with no public links. The reserved `saved_group_shares` table, per-member consent fields and endpoint consent on connections keep this path open without migration pain, honoring the product owner's requirement that we can build on private groups in the future.
25. **Block semantics — DECIDED 2026-11-26:** enforce bilateral targeting/join restrictions, including third-party co-targeting, with neutral failures, no retrospective rewriting, generic active-session review and no silent quorum changes.
26. **Contacts matching later — DECIDED 2026-11-26:** ship no address-book matching in the MVP; later uploads require separate consent, nonuser protections, opt-out and deletion.
27. **Saved-group size — DECIDED 2026-11-26:** cap saved groups at 11 invitees plus the owner to preserve the 12-person dinner limit.
28. **Ownership transfer — DECIDED 2026-11-26:** ship no ownership transfer in the MVP; later transfer requires new-owner acceptance and member consent.
29. **Connection consent — DECIDED 2026-11-26:** use disclosed automatic link-join activation for ease, with bilateral confirmation for historical suggestions/restoration; retain endpoint consent fields for future mutual opt-in.

30. **Central agent first, per-person upgrade path - DECIDED 2026-11-26:** product owner: "Yes, build the central agent first with the per-person upgrade path." Ship section 2A after retaining the first-half privacy fixes. Keep time polls and calendar connect; central ServerDelegates combine exact poll yes with title-free calendar clearance, and the deterministic matcher returns only the first eligible time or none to the organizer. Require host final OK and preserve explicit Host choice. Bound probing, purge time data and use service-only coarse result storage. Later replace delegates/transport and move matching to a rotating participant, preserving the candidate, eligibility, UI and result contracts. This is an accepted interim exception to operator-private blind delegation, not fulfillment of the no-central-component requirement. The phase 1 retirement-first proposal is superseded.

Verification boundary: only local source inspected. No network, live Supabase/project, provider capability, deployment, worker schedule or booking partnership accessed/verified. Section 2 records the local first-half fixes; new agent commands, storage, controls and limits describe accepted design, not implemented behavior. Effort remains estimated. Only this document and `docs/privacy-phase1-finalize-proposal.md` are revised.

### Changes recorded in this revision

- Added decision 30 and short interim amendments without renumbering decisions 1-29 or sections 3-12.
- Updated section 2 to match local privacy fixes and retained poll/calendar paths; added section 2A with the user experience, delegate contract, matcher, host approval, probing limits, title-free reads, storage, purge and blind upgrade.
- Scoped the later blind architecture/retirement instructions and updated phase 1 effort and program totals.
- Marked the separate phase 1 finalization proposal superseded; time polls and calendar connect are not retired.
