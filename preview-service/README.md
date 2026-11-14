# Live invitation previews

This small Node service is separate from the main GitHub Pages app. No Google,
Supabase, calendar, or GitHub secret is needed here. It calls only the existing
capability-protected public invitation summary/photo actions. It does not store
Google content. Humans redirect immediately to the GitHub app with the original
invite and theme. Recognized message crawlers receive server-rendered metadata
and a fresh Google-hosted image, restaurant website preview image, or an honest
generic fallback. Google Places currently returns no photos in the tested live
responses. Billing was left unchanged as requested. The live restaurant website
fallback was verified against Richmond Station and is credited distinctly.

Food-photo preference: website reads include the bounded page body, not just
Open Graph tags. The selector ranks food and restaurant-room photos, uses full
lazy/responsive images, and filters labelled logos, icons, tiny images and menu
graphics. Gusto 101 now uses its official spread of dishes rather than the logo
in its Open Graph tags. Photo classification uses source labels/context, not an
image-recognition guarantee. New live sharing URLs include `image=food1` so a
newly copied link differs from older WhatsApp cards that cached a logo.

Hosting project: `kinhai-collabs-projects/enkai-invites`, using the existing
Vercel Hobby account. Root directory is `preview-service`; outside-root files
are excluded. Google billing settings remain unchanged.
Public endpoint: `https://enkai-invites.vercel.app/i`. Verified without Vercel
login using a disposable Gusto 101 invitation: both themes returned personalized
HTML to a WhatsApp user agent with a reachable restaurant website image; normal
browser requests redirected to the correct invite/theme on GitHub Pages.

Deploy this directory as the project root on an existing Vercel account, with no
framework/build command. Then set `POLL_CONFIG.invitePreviewBase` in the main app
to `https://<verified-host>/i`. Test both themes with a disposable live-search
restaurant invitation before enabling that setting. Keep the endpoint inactive
until deployment is verified. A Netlify adapter can use the same core renderer.

GitHub Pages alone cannot emit different Open Graph tags per query parameter.
Supabase's default function domain rewrites HTML to plain text; its custom-domain
option also works but requires a domain and provider configuration. Do not point
sharing at an unconfigured server or publish Google photos into this repository.

The app displays Google Maps/author credits and direct source links when supplied.
Chat previews are thumbnails; opening the invitation shows the attributed photo.
WhatsApp controls its own preview rendering/caching and can disable previews.
The original 900-search/month cap and existing 900-photo/month cap remain separate.
Photo resolutions also have a per-dinner limit of 30/minute and 150/day.
