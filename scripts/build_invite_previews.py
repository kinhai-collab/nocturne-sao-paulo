"""Create static, crawler-readable restaurant pages. Never export dinner records."""
from pathlib import Path
from html import escape
import json
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://kinhai-collab.github.io/nocturne-sao-paulo/'
venues = json.loads((ROOT / 'planner-venues.js').read_text(encoding='utf-8').split('=', 1)[1].strip().rstrip(';'))
(ROOT / 'invite').mkdir(exist_ok=True)
(ROOT / 'assets/invitations').mkdir(exist_ok=True)
for venue in venues:
    slug = venue['id']
    assert re.fullmatch(r'[a-z0-9-]+', slug), slug
    # Format conversion of existing restaurant photography, not generated imagery.
    with Image.open(ROOT / venue['image']) as source:
        photo = source.convert('RGB')
        photo.thumbnail((1200, 1200))
        photo.save(ROOT / f'assets/invitations/{slug}.jpg', quality=86, optimize=True)
        width, height = photo.size
    name, city = escape(venue['name']), escape(venue['location'])
    image = BASE + f'assets/invitations/{slug}.jpg'
    title = f'You’re invited to dinner at {name} · Enkai'
    description = f'{city} · Open your invitation to choose a time or RSVP. Bring your people together with Enkai.'
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>{title}</title><meta name="description" content="{description}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Enkai">
<meta property="og:title" content="{title}"><meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">
<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="{width}"><meta property="og:image:height" content="{height}">
<meta property="og:image:alt" content="Restaurant photo: {name}"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../planner.css?v=sharing1"><script src="../invite.js?v=sharing1" defer></script></head>
<body><main class="card stack" style="max-width:640px;margin:5vh auto;padding:24px">
<p>Enkai · You’re invited</p><h1>Dinner at {name}</h1><p>{city}</p>
<img src="{image}" alt="{name}" style="width:100%;height:auto;border-radius:16px">
<small><a href="{escape(venue['source'], quote=True)}" rel="noopener noreferrer">Restaurant photo source</a></small>
<p id="invite-help">Opening your invitation…</p><a id="open-invite" href="../planner.html">Open Enkai</a>
<noscript>Enable JavaScript and reopen the complete invitation link your host shared.</noscript>
</main></body></html>'''
    (ROOT / f'invite/{slug}.html').write_text(page, encoding='utf-8')
print(f'Built {len(venues)} restaurant previews. No dinner records or invitation tokens exported.')
