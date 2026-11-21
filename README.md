# Enkai — Group meal planning

Enkai helps people coordinate dinners and gatherings: agree on a time, discover
restaurants, optionally vote with friends and family, track RSVPs, and manage
calendar invitations. The project also preserves its original São Paulo
Michelin dining guide and Toronto/Ontario restaurant guides.

## Repository identity and public deployment

- **Canonical repository after cutover:** https://github.com/kinhai-collab/enkai
- **Enkai site after cutover:** https://kinhai-collab.github.io/enkai/
- **Enkai meal planner after cutover:**
  https://kinhai-collab.github.io/enkai/planner.html
- **Current production before cutover:**
  https://kinhai-collab.github.io/enkai/
- **Migration status:** The repository rename and provider cutover are not
  automatic. Complete the safety plan in docs/enkai-rename-cutover.md before
  merging the path migration.

GitHub Pages publishes the static frontend from main using
.github/workflows/pages.yml. .nojekyll enables buildless static output.
Supabase Edge Functions manage authenticated plans, voting and calendar
workflows. Google Places powers server-side restaurant discovery.
Vercel hosts the separate Enkai invitation preview service.

The public site has Enkai branding. Earlier Nocturne editorial theme names,
São Paulo content, browser storage keys and remembered-session token prefixes
are intentionally retained for compatibility.

## Application structure

- planner.html, planner.js, planner-mobile.js, planner-calendar.js:
  shared meal planner and Google/Microsoft web sign-in.
- group-finder.js, group-shortlist.js: group restaurant shortlists and
  organizer choice / optional family poll.
- invitation-sharing.js, invite.js, i.html, invite/:
  invitation URLs and static restaurant previews.
- index.html, nocturne.html, beyond.html, ontario.html:
  dining guide and legacy themed pages.
- supabase/functions/ and supabase/migrations/:
  authenticated backend, private database tables and OAuth callbacks.
- preview-service/: credential-free Vercel invitation Open Graph previews.
- native/, scripts/build-ios.mjs, capacitor.config.json:
  unsigned iOS beta foundation; native OAuth is still gated.
- codemagic.yaml: manual-only signing preflight for the Enkai bundle ID;
  no TestFlight publishing.
- tests/: JavaScript, calendar, backend and iOS regression tests.

## Security and operational boundaries

Supabase signs and validates identity with restricted providers and
server-stored secrets; the frontend must not contain service-role credentials.
Google Places credentials stay in the Supabase environment. Invitation
previews return limited public metadata, never organizer ballot data.
Restaurant discovery is not a confirmed reservation.

Historical Google Apps Script files (Code.gs, Forge.gs) remain for
reference; Supabase is the active backend. Do not switch production
back to Google Sheets.

Restaurant photos include attributions; public reuse rights for every
image have not been independently verified. Fonts use the bundled OFL
licenses. Forge licensing is retained in FORGE-LICENSE.txt.

## References

- docs/enkai-rename-cutover.md — safe repo rename, GitHub Pages
  redirects, OAuth provider updates and deployment verification
- docs/ios-testflight.md — native authentication and TestFlight gates
- docs/enkai-codemagic-signing.md — manual Apple signing preflight
- supabase/CALENDAR-SETUP.md — calendar provider and callback setup
- privacy.html — user privacy and data handling

**Do not merge a Pages path rename without protecting existing invitation
links and configuring the new Microsoft and calendar redirect paths.**
