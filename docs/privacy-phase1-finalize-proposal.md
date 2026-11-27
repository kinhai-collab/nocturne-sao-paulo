# SUPERSEDED — Phase 1, Chunk B: interim finalization proposal

**SUPERSEDED 2026-11-26 by decision 30:** the product owner decided, “Yes, build the central agent first with the per-person upgrade path.” The current plan is [section 2A: Interim stage: central scheduling agent with a per-person upgrade path](group-agent-design.md#2a-interim-stage-central-scheduling-agent-with-a-per-person-upgrade-path). **Time polls and calendar connect are NOT retired.** Keep the first-half privacy fixes done locally and add the central agent, title-free calendar checks, host final OK, probing limits and retention described there.

Everything below is the historical proposal, retained for context. Its rejection of central matching, removal of time polls and calendar-retirement instructions are no longer the phase 1 plan. The long-term blind-delegate intent remains in the group-agent design; the accepted interim stage does not satisfy its no-central-component requirement.

Proposal only; Chunk A implements read-side closure. Plaintext time writes and shared calendar services still exist after Chunk A. This is not full phase 1 compliance.

Recommend a single organizer proposal with voluntary attendance until blind personal delegates exist. Decisions 8, 18 and 19 and sections 1 and 8 of the group-agent design govern this change. No central component may compute over several people's availability, even if it returns only a boolean.

## Options

**A. One proposed time, then attendance.** The organizer enters one date, time, destination zone and duration, chooses a restaurant, and publishes a dinner proposal. Guests privately decide whether to attend. They choose Going or Can't attend. Explain before submission that Going shares their name with dinner participants; a negative response stays private. Joining or connecting a calendar never counts as consent. Participants see the proposed plan and affirmative attendees only, with no rejection list, waiting count or response history. Label the plan as an organizer proposal, not group agreement or agent approval. This preserves the accepted final-attendance exception without comparing availability centrally.

**B. Private server check: “a time works” / “no time works yet.”** Reject this option. The server would read everyone's time answers and compute a joint result. Hiding its inputs and scores from the organizer does not satisfy section 1's prohibition on central intersection, shared runtimes and reconstructable availability aggregates. Repeated checks could also expose compatibility bits. Server encryption at rest does not make this blind delegation.

**C. Publish a dinner without a time, then propose one later.** This also fits the document if the first stage collects no time answers at all. Guests can join and optionally express standalone restaurant preferences. The organizer later publishes one concrete proposal, using flow A for attendance. It offers early invitation sharing, but adds a second visit and needs clear “Date to be proposed” copy. Another compliant fallback is to pause scheduling until blind delegates ship; that removes useful coordination for longer.

## Recommended experience

Use A, retaining C only as a simple draft/invitation state if needed. Remove multi-time polls, select-all/none availability controls, own time-ballot receipts, time-option editing and any host override that treats historical answers as approval. Remove the current Undecided wizard path; a time-free draft may replace it without collecting availability. Organizers choose a proposal directly, without counts or leader recommendations. Guests lose the ability to submit several workable dates; they keep an explicit attendance choice for one exact plan. Coarse copy must not imply that everyone answered or approved.

Changing the schedule, duration, zone, restaurant or roster creates a new version and requires fresh affirmative consent. Clear previous attendance authorization and calendar confirmation. No old ballot can authorize the change. A declined reply never blocks others or identifies a scheduling bottleneck. Do not automatically cycle proposals based on negative replies or use attendance to score alternative times. Cancellation and manual reservation recording keep their existing meanings.

## Existing dinners and data removal

First reject plaintext time ballots through every write path, including legacy vote/respond clients, direct RPC paths and manage finalization bypasses. Require incompatible clients to upgrade; flags and rollback must never restore disclosure. Keep restaurant-only writes separate. Existing open time polls become “Date to be proposed.” Preserve dinner IDs, links, identities and standalone restaurant preferences; discard candidate ballots and ask organizers to enter one proposal. Existing final dinners remain labeled “Legacy host choice,” without fabricated agreement; request consent where needed.

After disabling writes, delete historical time-answer JSON, including confirmed-schedule/reconfirmation remnants that reconstruct ballots, copied detail fields and stale cache/draft versions. Preserve legitimate final dinner facts and current affirmative consent. Inventory backups, exports, logs and retention first; expire historical copies under an explicit backup policy. Verify deletion offline and at rollout. Clear/version browser drafts and caches on upgrade, logout and account switch. Prior recipient and crawler copies cannot be recalled.

## Calendar retirement

Globally revoke operator-readable broad provider grants, delete stored refresh credentials and cached event data, and stop conflict-check, calendar-sync and retry workers, queued jobs and OAuth callbacks that could recreate grants. Remove shared Connect calendar and server conflict checks. Invite sync, attendee-email delivery and calendar reply tracking stop; explain that existing provider events may remain and require owner cleanup. Provide owner-reviewed calendar downloads or private device-created entries without attendee lists. A future Connect calendar must keep credentials and reads solely on the owner's device. Full phase 1 completion requires verified retirement, not a hidden button or disabled worker flag.

## Changes recorded in this revision

- Marked this proposal SUPERSEDED by the 2026-11-26 central-agent-first decision and linked the replacement section.
- Made clear that time polls and calendar connect stay; the historical rejection and retirement instructions above are not current phase 1 requirements.
