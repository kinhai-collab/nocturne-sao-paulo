# Enkai iOS / TestFlight readiness — November 2026

## Current state: iOS foundation only (not yet a TestFlight build)

This branch adds a reproducible Capacitor 8 iOS container around Enkai's existing
HTML/CSS/JavaScript frontend. It leaves GitHub Pages, Supabase, Google Places,
calendar APIs, billing, and the production OAuth registrations unchanged.

The iOS shell is deliberately **sign-in gated**: the current website uses Google
Identity Services (browser JS) and MSAL Browser redirects, neither of which
should be used as-is inside an arbitrary iOS WKWebView. Native sign-in requires
additional provider/client setup. Until then, the shell offers an explicit handoff
to the current working web version using an Apple system browser view. This
does not magically sign in the native app. Invitation links also use that safe
browser handoff until native identity and backend-origin support are completed.

- Web: https://kinhai-collab.github.io/enkai/planner.html
- Backend: existing Supabase Edge Functions, unchanged
- Invitation previews: existing Vercel endpoint, unchanged
- Provisional bundle ID: com.kinhai.enkai.beta (confirm before App Store record)
- Native webDir: www/ (generated; excluded from Git)
- Native iOS project: ios/ (generated with Capacitor + Swift Package Manager)

## Build on a Mac

Prerequisites: Node 22+, current npm, macOS, Xcode 26+, Xcode command-line tools.

1. Clone the repository and check out the iOS feature branch.
2. Run: npm install --no-audit --no-fund
3. Run: npm run ios:assets
4. Run: npm run ios:check
5. Run: npm run ios:init (creates an unsigned iOS project and registers the
   invitation-only enkai:// custom URL scheme).
6. Run: npm run ios:open, then build and run on an iOS Simulator.
7. After frontend changes: npm run ios:sync, then build again.

This generated application can be compiled without Apple Developer signing.
The GitHub Actions macOS job tests an unsigned Simulator build and uploads
the generated project as a temporary CI artifact. It does **not** generate
a signed distributable IPA or upload anything to App Store Connect.

## Mandatory blockers before a useful family TestFlight

### Native Google authentication

- Register a Google OAuth *iOS* client for the final bundle ID.
- Implement approved native Google Sign-In or ASWebAuthenticationSession
  with OIDC authorization-code PKCE. Do not use browser GSI in WKWebView.
- Review the current backend's single Google web-client token audience and
  its azp validation. Explicitly allow only verified native-client/server-client
  combinations, preserving signature, issuer, expiry, and verified email checks.
- Create a secure native login-session handoff. Never put OAuth tokens in
  Universal Links, app URLs, logs, client config, or browser-visible links.

### Native Microsoft authentication

- Current MSAL Browser redirect targets the hosted web planner.
- Configure Microsoft native-client redirect registration and an approved
  system-browser or native MSAL PKCE flow.
- Preserve backend audience/tenant verification and explicit account linking.

### Native origin and API access

- The current Supabase Edge Function intentionally allows only the GitHub
  Pages Origin. The bundled app uses a different origin (typically
  capacitor://localhost), so authenticated API calls are blocked today.
- Add an exact allowlist after the identity design is finalized; reflect only
  allowed Origin values and preserve Vary: Origin, strict authentication,
  authorization, rate limiting and HTTPS. Do not change production CORS now.

### Invitation and calendar return paths

- Native shell currently parses only opaque invitation codes from known
  domains/custom scheme and hands them to the working browser site.
- Native Universal Links require a confirmed Apple Team ID, an associated
  domain entitlement, and an apple-app-site-association file at a valid
  hostname-level path. A GitHub Pages project path alone may not suffice.
- Test WhatsApp, Messages, email, install/no-install and cold-start cases.
- The calendar OAuth callback currently finishes in the web application.
  Plan and test a state-bound native return; never pass calendar refresh
  tokens through invitation links or app URL fragments.

### Apple release requirements

- Apple Developer Program, Team ID, App Store Connect access and app record.
- Permanent bundle ID, iOS Distribution signing certificates and profiles.
- Audit licensing and distribution rights for bundled restaurant photography, as the existing repository README does not verify all image reuse permissions.
- Branded icon, app privacy details, SDK privacy manifests, user support and
  data-deletion documentation, and beta-review contact information.
- Review App Store guidelines 4.2 (more than a repackaged web page) and 4.8
  (privacy-preserving equivalent login where applicable).
- Create external TestFlight group and submit the first external build for
  beta review if required.

## Real-iPhone TestFlight acceptance test

1. Native Google login and secure session restoration/logout work.
2. Native Microsoft login works or scope is explicitly documented and tested.
3. Native backend-origin requests are authorized without weakening CORS.
4. Two iPhones can create, join and vote on the same meal safely.
5. Twelve-person attendee counts and agreed time remain intact.
6. Group restaurant discovery uses live Google Places; suggestions do not
   falsely claim availability or reservations.
7. Calendar connection/RSVP, time-zone, rescheduling and cancellation work.
8. Invitation links and the no-install browser fallback work in messaging apps.
9. Accessibility, offline errors, keyboard, Safe Area and privacy pass.
10. Signed build is uploaded to App Store Connect and appears in TestFlight.

## Explicitly not yet verified

Developer account availability, signing, real iOS device behavior, native Google
or Microsoft login, backend origin changes, Universal Links, native calendar
callbacks, App Store Connect submission, or any signed TestFlight build.
