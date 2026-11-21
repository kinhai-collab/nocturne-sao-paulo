# Reusing the Mira Apple Developer team for Enkai

Apple Developer Program membership is tied to an Apple Developer team, not to
a single app. The same team may publish Mira and Enkai, **with separate bundle
identifiers and app records**. Team signing certificates are team-level;
App Store Connect provisioning profiles are tied to a particular explicit App ID.

## Verified in Enkai

- Native iOS project can be generated via Capacitor and compiled unsigned in Xcode.
- Enkai's provisional bundle ID is com.kinhai.enkai.beta.
- Existing App Store Connect enrollment and Mira account details are **not**
  accessible through the connected GitHub account or the available project files.
- No Mira source, Apple Team ID, App Store Connect API key, signing identity,
  provisioning profile, or App Store Connect app ID has been found.
- No Apple secret was copied, created, exposed, revoked, or used.

## Reuse securely — no key transfers through this repository

1. In Mira's Xcode project: open **Signing & Capabilities** and inspect the
   selected Team. Alternatively, in Xcode > Settings > Accounts, choose
   the same Apple account to see its teams. Record the ten-character Team ID
   as non-secret configuration.
2. In Enkai's generated Xcode project, select that **same team** under
   Signing & Capabilities, with a **different bundle ID** from Mira.
   Keep com.kinhai.enkai.beta only if it is available and you intend to
   use it permanently.
3. Under the same Apple Developer team, register Enkai's unique App ID
   and create its own App Store Connect app record.
4. Prefer Xcode automatic signing on a trusted Mac. It can use the account's
   existing team signing setup and manage Enkai's matching profile.
   Do not copy Mira's provisioning profile to Enkai.
5. If Mira uses CI signing instead of Xcode-managed signing, review how
   its existing Apple Distribution certificate and App Store Connect API
   key are scoped. Only reuse those signing assets through an approved,
   access-restricted secret manager or environment, never the public repo.
   Existing GitHub Actions repository secrets do not automatically become
   available to another repository. A GitHub organization secret can be
   granted to explicitly selected repositories.
6. On your trusted Mac, you may run the **read-only** metadata check:
   APPLE_TEAM_ID=YOUR_TEAM_ID npm run ios:team-check
   This verifies the team ID format and unique bundle configuration only;
   it cannot prove that your account or signing assets are available.
7. Do not upload a signed TestFlight build until the native login,
   native API origin and invitation/calendar workflows in the iOS readiness
   document have been secured and tested.

## What still requires account-level access

- Confirm Apple's Team ID and Enkai bundle ID availability.
- Confirm Mira's signing method (automatic Xcode, Xcode Cloud, or CI).
- Confirm whether an App Store Connect API key is scoped and permissioned
  for Enkai, if an automated upload workflow is desired.
- Create Enkai's own App ID and app record.
- Confirm the Apple Developer agreement and distribution access.
- Complete secure native Google and Microsoft auth before external beta.

Never paste an App Store Connect .p8 private key, .p12 signing identity,
Apple password, provisioning profile, or other secrets into chat or GitHub.
A Team ID and bundle ID are identifiers, not credentials.

References:
https://developer.apple.com/help/account/certificates/certificates-overview
https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution
https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
