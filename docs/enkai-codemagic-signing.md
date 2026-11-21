# Enkai Codemagic signing preparation

## Mira reference supplied by the account owner

- Apple Developer Team ID: SDJ9ABWBH3
- Mira bundle ID: com.miracopilot.mira.lab
- Mira App Store Connect Apple app ID: 6837398055 (**Mira only; do not use for Enkai**)
- Mira CI method: Xcode Automatic signing with an App Store profile selected by Codemagic before exporting an IPA
- Codemagic team integration alias: mira-lab-apple (App Manager API access)
- Mira TestFlight group: Kin Lab Internal (**Mira group; Enkai tester membership not established**)
- Mira manually initiated release workflow: kin-lab-testflight (**do not trigger this to release Enkai**)
- Mira capability: Sign in with Apple enabled (**does not enable this capability for Enkai**)

These are user-supplied identifiers and operational descriptions, not
independently verified account access. No private keys or signing identities
have been read or moved. The current chat has access to GitHub but not a
connected Codemagic or App Store Connect account.

## Enkai application identity

- Proposed distinct bundle ID: com.kinhai.enkai.beta
- Apple Team ID to use after portal verification: SDJ9ABWBH3
- Enkai App Store Connect Apple app ID: **NOT CREATED / NOT VERIFIED**
- Enkai provisioning profile: **NOT VERIFIED**
- Enkai Sign in with Apple capability: **NOT ENABLED / NOT VERIFIED**
- Enkai native Google/Microsoft login: **NOT IMPLEMENTED**
- Enkai signed TestFlight build: **NOT UPLOADED**

## Manual-only signing preflight

The root codemagic.yaml references the shared team integration alias
mira-lab-apple, but uses **Enkai's own bundle ID**. It has no automatic
triggers and **no publishing section**, so it cannot upload to TestFlight.

To run the signing preflight, first:

1. In the Apple Developer portal under team SDJ9ABWBH3, confirm the final
   Enkai bundle ID is available and register an explicit App ID (distinct
   from Mira).
2. Create the corresponding Enkai App Store provisioning profile with
   an appropriate Apple Distribution certificate already available to
   the Codemagic team. Team distribution certificates may be shared,
   but the app provisioning profile must match Enkai.
3. Add the Enkai GitHub repository as **its own app** in the same
   Codemagic team that owns integration mira-lab-apple.
4. Confirm the integration name is visible and has permission to sign
   for the Enkai App ID. Codemagic integration access is not proven
   just because an alias exists in YAML.
5. Explicitly set the Enkai Codemagic app variable
   ENKAI_ENABLE_SIGNED_PREFLIGHT=true. Do not set this on Mira. Execute
   the workflow manually. It generates an IPA artifact only, not an
   App Store Connect/TestFlight upload.
6. Keep production data, Apple secrets and encrypted credential material
   in approved Apple/Codemagic key stores. Never copy .p8, .p12,
   provisioning profiles or passwords into GitHub.

### TestFlight remains gated

The current Enkai native app is an iOS foundation with system-browser
handoff, not a working signed-in native client. Before TestFlight testing
with the family, complete the blockers in docs/ios-testflight.md and
issues #4 (native auth & origin), #5 (links & calendar callbacks) and
#6 (app registration, signing and beta compliance). For the first
release, create a **separate Enkai TestFlight group** under the Enkai
App Store Connect record. Mira's group is not a cross-app group.

Sign in with Apple enabled on Mira does not carry over to Enkai;
any equivalent-login obligations must be reviewed per Enkai's app.

## Workflow implementation notes

- No GitHub Actions credentials, GitHub repository secrets, or Apple
  team signing keys are read by this configuration.
- The Codemagic workflow requires manual selection; omitting triggering
  means no automatic branch-based builds.
- Using app_store signing asks Codemagic for an App Store certificate
  and **Enkai-specific** profile; it does not grant Apple account access
  automatically.
- There is no publishing section. A later, reviewed release workflow
  must deliberately opt into App Store Connect submission under a
  distinct Enkai app record.
- The app's current WebView OAuth blockers are unchanged. Building a
  signed IPA is **not** evidence that native login works.

See current Codemagic documentation:
https://docs.codemagic.io/yaml-code-signing/signing-ios/
https://docs.codemagic.io/yaml-publishing/app-store-connect/
https://docs.codemagic.io/yaml-running-builds/starting-builds-automatically/
