const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const text=fs.readFileSync('codemagic.yaml','utf8');
const docs=fs.readFileSync('docs/enkai-codemagic-signing.md','utf8');
const config=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));

test('Codemagic config uses Mira Apple team integration but Enkai-only identity',()=>{
  assert.match(text,/app_store_connect:\s*mira-lab-apple/);
  assert.match(text,/ENKAI_APPLE_TEAM_ID:\s*SDJ9ABWBH3/);
  assert.match(text,/bundle_identifier:\s*com\.kinhai\.enkai\.beta/);
  assert.equal(config.appId,'com.kinhai.enkai.beta');
  assert.doesNotMatch(text,/com\.miracopilot\.mira\.lab/);
  assert.doesNotMatch(text,/6837398055/);
});

test('Codemagic cannot auto-publish or trigger by push',()=>{
  assert.match(text,/enkai-ios-signing-preflight:/);
  assert.doesNotMatch(text,/^\s*triggering\s*:/m);
  assert.doesNotMatch(text,/^\s*publishing\s*:/m);
  assert.doesNotMatch(text,/submit_to_testflight/);
  assert.match(text,/ENKAI_ENABLE_SIGNED_PREFLIGHT:-/);
  assert.match(text,/exit 1/);
});

test('Signing configuration only selects an Enkai profile and does not expose secrets',()=>{
  assert.match(text,/distribution_type:\s*app_store/);
  assert.match(text,/xcode-project use-profiles/);
  assert.match(text,/xcode-project build-ipa/);
  assert.doesNotMatch(text,/-----BEGIN .*PRIVATE KEY-----/);
  assert.doesNotMatch(text,/APPLE.*PRIVATE_KEY:/);
  assert.doesNotMatch(text,/\.p8|\.p12|\.mobileprovision/);
});

test('Documentation distinguishes Mira and Enkai app identities',()=>{
  assert.match(docs,/Mira bundle ID: com\.miracopilot\.mira\.lab/);
  assert.match(docs,/Mira App Store Connect Apple app ID: 6837398055/);
  assert.match(docs,/Enkai App Store Connect Apple app ID: \*\*NOT CREATED \/ NOT VERIFIED\*\*/);
  assert.match(docs,/Mira.*group is not a cross-app group/);
  assert.match(docs,/No private keys or signing identities/);
});
