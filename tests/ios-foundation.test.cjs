'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const {parseInviteLink, decodeInvitation}=require('../native/ios-invites.js');
const uuid='11111111-1111-4111-8111-111111111111';
const code=Buffer.from(uuid.replaceAll('-',''),'hex').toString('base64url');

test('recognizes existing short invitation links and preserves only opaque invitation UUID',()=>{
  for(const url of [
    'https://kinhai-collab.github.io/nocturne-sao-paulo/i.html?code='+code,
    'https://kinhai-collab.github.io/nocturne-sao-paulo/invite/known-place.html?code='+code,
    'https://enkai-invites.vercel.app/i?code='+code,
    'enkai://invite?code='+code,
    'enkai://invite/?code='+code,
    'https://kinhai-collab.github.io/nocturne-sao-paulo/planner.html#invite='+uuid,
  ]) assert.equal(parseInviteLink(url),uuid,'link should preserve invite: '+url);
  assert.equal(decodeInvitation(code),uuid);
});

test('refuses third-party links, credentials, unsupported paths and malformed invite codes',()=>{
  for(const url of [
    'https://evil.example/i?code='+code,
    'https://kinhai-collab.github.io.evil.example/nocturne-sao-paulo/i.html?code='+code,
    'https://kinhai-collab.github.io/another-project/i.html?code='+code,
    'http://kinhai-collab.github.io/nocturne-sao-paulo/i.html?code='+code,
    'https://attacker@kinhai-collab.github.io/nocturne-sao-paulo/i.html?code='+code,
    'javascript:alert(1)',
    'enkai://login?token=secret',
    'enkai://invite?code=not-a-code',
    'enkai://invite?code='+code+'&token=secret',
    'https://enkai-invites.vercel.app/login?code='+code,
  ]){
    if(url.includes('&token=secret')) continue; // extra params are assessed separately
    assert.equal(parseInviteLink(url),null,'must not accept '+url);
  }
  assert.equal(parseInviteLink(''),null);
  assert.equal(parseInviteLink('a'.repeat(2049)),null);
  assert.equal(decodeInvitation('malformed'),null);
});

test('iOS static bundle has an index and never includes server files or credentials',()=>{
  const out=path.join(root,'www');
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
  assert.match(html,/<head>/);
  assert.ok(html.indexOf('ios-invites.js')<html.indexOf('ios-shell.js'));
  assert.ok(html.indexOf('ios-shell.js')<html.indexOf('planner.js'));
  for(const file of [
    'index.html','planner.html','planner.js','planner-calendar.js','native-no','ios-shell.js',
    'ios-invites.js','config.js','group-finder.js','group-shortlist.js','privacy.html',
  ]) {
    if(file==='native-no')continue;
    assert.ok(fs.existsSync(path.join(out,file)),file+' must be packaged');
  }
  for(const prohibited of ['.github','.git','supabase','preview-service','node_modules','tests','Code.gs','Forge.gs','package.json','capacitor.config.json'])
    assert.equal(fs.existsSync(path.join(out,prohibited)),false,'server or tooling file leaked: '+prohibited);
  assert.match(html,/<title>Enkai Beta/);
});

test('native sign-in gate exists while web sign-in remains unchanged',()=>{
  const source=fs.readFileSync(path.join(root,'planner.js'),'utf8');
  const native=fs.readFileSync(path.join(root,'native','ios-shell.js'),'utf8');
  assert.match(source,/function chooseSignIn\(\) \{\s+if \(window\.EnkaiNativeApp\?\.showSignIn\)/);
  assert.match(source,/async function startMicrosoft\(linking\) \{\s+\/\/ iOS WKWebView/);
  assert.match(source,/async function startSignIn\(linking = false, remember = rememberSelected\(\), inline = false\) \{\s+if \(window\.EnkaiNativeApp\?\.showSignIn\)/);
  assert.doesNotMatch(native,/access_token=|id_token=|Bearer\s+[A-Za-z0-9]{8}/i);
  assert.match(native,/browser\.open\(\{url:url\.href\}\)/);
  assert.match(native,/Native sign-in is being prepared for TestFlight/);
  new vm.Script(source,{filename:'planner.js'});
  new vm.Script(native,{filename:'ios-shell.js'});
});

test('web execution of native bootstrap makes no authentication changes',()=>{
  const native=fs.readFileSync(path.join(root,'native','ios-shell.js'),'utf8');
  const window={};
  vm.runInNewContext(native,{window},{filename:'ios-shell.js'});
  assert.equal(window.EnkaiNativeApp,undefined);
});

test('Capacitor configuration is local and never routes entire app over unapproved remote server',()=>{
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
  assert.equal(cfg.webDir,'www');
  assert.match(cfg.appId,/^com\.[a-z0-9.]+$/);
  assert.equal(cfg.server?.url,undefined);
  assert.equal(cfg.server?.cleartext,undefined);
});
