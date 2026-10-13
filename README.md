# Nocturne — São Paulo dining poll

Public site: https://kinhai-collab.github.io/nocturne-sao-paulo/

The site uses GitHub Pages with local fonts and photos, independent of ChatGPT hosting. The layout is fluid across narrow and ultra-wide browsers. All 16 Michelin-starred restaurants are included; diners can select up to five. The hero contains eight photos, ten-second rotation, 1.5-second crossfades and previous/next controls.

Voting is currently an explicitly labeled browser-only demo. Google sign-in and shared Google Sheets storage are implemented but require a Google OAuth client ID and Apps Script /exec URL in config.js. See setup.html. Set authorized JavaScript origin and ALLOWED_ORIGINS to https://kinhai-collab.github.io (without the repository path). Keep the Google Sheet private. No secrets belong in this repository.

Public results expose only totals. Once configured, the backend checks Google token signatures, audience, issuer, expiry and challenge, and stores one ballot per Google account. Real Google authentication and Sheet writes remain unverified until configured.

Photo source and attribution: assets/PHOTO-SOURCES.txt. Public reuse permission has not been verified. Fonts are self-hosted from Google Fonts under the included OFL licenses. Forge 1.4.0 license is in FORGE-LICENSE.txt.

Publish source: main branch, root folder, GitHub Pages. The .nojekyll file enables buildless static output. All frontend assets are served from this GitHub Pages origin; no ChatGPT assets, sign-in or hosting are needed. Google services are contacted only when the organizer enables Google sign-in/shared voting.

## Active voting storage — Supabase
The public site now uses `https://mxmqqqzxopjinlkjtcnb.supabase.co/functions/v1/dining-poll` with `transport: 'supabase'` in config.js. The older Google Apps Script instructions above describe the retired connection, not the current setup.

Server source and private-table schema are in `supabase/`. The function verifies Google RS256 tokens with the fixed client audience, issuer, expiry and nonce. Database uniqueness prevents duplicate account ballots. Row-level security is enabled; anonymous and authenticated client roles have no table access. The service-role key is supplied only by Supabase's server environment and never belongs in GitHub/frontend files. The gateway's legacy Supabase JWT check is off because the function implements Google authentication itself. Only public restaurant totals are returned.

Organizer records: https://supabase.com/dashboard/project/mxmqqqzxopjinlkjtcnb/editor — open `dining_ballots`. `dining_challenges` contains temporary sign-in nonces and is cleaned as sign-in challenges are requested. No submitted votes were present when switching storage. The old Sheet is retained but no longer receives new ballots.
