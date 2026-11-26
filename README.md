# Enkai — dining guides, voting and meal planning

Public site: https://kinhai-collab.github.io/nocturne-sao-paulo/

## Current architecture

- **Frontend:** static HTML, CSS and JavaScript hosted on GitHub Pages, with local fonts and restaurant photos. The `Publish Enkai` workflow in `.github/workflows/pages.yml` uploads the site with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages` on pushes to `main` or manual dispatch. In repository Settings → Pages, set Source to **GitHub Actions**.
- **Voting:** `config.js` selects `transport: 'supabase'` and the `dining-poll` Edge Function at `https://mxmqqqzxopjinlkjtcnb.supabase.co/functions/v1/dining-poll`. Google sign-in protects shared ballots; diners can select up to five starred restaurants. Public results show restaurant totals and first initials. A browser-only demo remains available when no endpoint is configured.
- **Meal planner:** `planner.html` and the `planner*.js` files use the Supabase `meal-planner` Edge Function for dinner polls, invitations, availability and RSVP. Optional calendar integration uses `calendar-callback` and `calendar-worker`; see `supabase/CALENDAR-SETUP.md` for the full migration and deployment order.
- **Invitation previews:** the separate Node service in `preview-service/` runs on Vercel. `config.js` sets `invitePreviewBase` to `https://enkai-invites.vercel.app/i`. Message crawlers receive invitation metadata and a photo or fallback; browsers redirect to the GitHub Pages invitation. See `preview-service/README.md`.
- **iOS app:** the Capacitor foundation bundles the existing web frontend for iOS and hands sign-in and invitation links to the hosted web app. Native authentication and TestFlight readiness remain incomplete; see [iOS / TestFlight readiness](docs/ios-testflight.md). The `package.json` scripts prepare iOS assets separately from GitHub Pages publishing.

Server source and private-table schema are in `supabase/`. The voting function verifies Google RS256 tokens with the configured client audience, issuer, expiry and nonce. Database uniqueness prevents duplicate account ballots. Row-level security is enabled; anonymous and authenticated client roles have no direct ballot-table access. The service-role key is supplied only by the server environment and never belongs in GitHub/frontend files. The gateway's legacy Supabase JWT check is off because the function implements Google authentication itself.

Organizer records: https://supabase.com/dashboard/project/mxmqqqzxopjinlkjtcnb/editor — open `dining_ballots`. `dining_challenges` contains temporary sign-in nonces and is cleaned as sign-in challenges are requested.

## Guides and photography

The guide data contains 54 restaurants: 16 São Paulo starred restaurants in `data.js` (`RESTAURANTS`), 15 Beyond the Stars restaurants in `beyond-data.js`, and 23 Ontario restaurants in `ontario-data.js`. The latter two files each define `BEYOND_RESTAURANTS` for their respective pages.

All 54 guide restaurants have a card image and a details gallery of up to five images in `media-data.js`. Galleries crossfade every 10 seconds with previous/next and pause controls; reduced-motion preferences start them paused. Images are hosted locally under `assets/restaurants/`, with original asset URLs in `assets/restaurants/SOURCES.json`. Official websites are preferred; Fame Osteria, Kan Suke, Kazuo, Casa do Porco, Banzeiro and Jiquitaia use credited MICHELIN profile photography. The starred-guide hero contains eight photos, ten-second rotation, 1.5-second crossfades and previous/next controls.

Beyond the Stars contains 15 restaurants, including Banzeiro, Ama.zo (Campos Elísios), Jiquitaia, Komah, Fitó (Pinheiros), and Bar da Dona Onça. Jiquitaia pricing is an explicitly labeled sample order from its official menu; other reported ranges retain their publication dates.

Photo source and attribution: `assets/PHOTO-SOURCES.txt` and `assets/restaurants/SOURCES.json`. Public reuse permission has not been verified. Fonts are self-hosted from Google Fonts under the included OFL licenses. Forge 1.4.0 license is in `FORGE-LICENSE.txt`.

## Retired: Google Apps Script setup (historical)

The former shared-voting backend used Google Apps Script and a private Google Sheet. Its source is retained in `Code.gs` and `Forge.gs`; the old Sheet no longer receives ballots from the current Supabase configuration.

That setup required a Google OAuth client ID and Apps Script `/exec` URL in `config.js`, with authorized JavaScript origin and `ALLOWED_ORIGINS` set to `https://kinhai-collab.github.io` (without the repository path). The Sheet had to remain private. These instructions describe the retired connection; `setup.html` now explains current Supabase voting. No secrets belong in this repository.
