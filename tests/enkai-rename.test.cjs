'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const newBase='https://kinhai-collab.github.io/enkai/';
const oldSlug='nocturne-sao-paulo';

test('Enkai canonical paths are used by the serving application and generated previews',()=>{
  const readme=read('README.md');
  assert.match(readme,/^# Enkai /);
  assert.ok(readme.includes('kinhai-collab/enkai'));
  const core=read('preview-service/core.mjs');
  assert.ok(core.includes(newBase));
  assert.equal(core.includes('github.io/'+oldSlug+'/'),false);
  assert.ok(read('native/ios-shell.js').includes(newBase+'planner.html'));
  assert.ok(read('supabase/functions/_shared/calendar-core.ts').includes(newBase));
  assert.ok(read('supabase/functions/calendar-callback/index.ts').includes(newBase+'planner.html'));
  assert.ok(read('scripts/build_invite_previews.py').includes(newBase));
});

test('every generated restaurant invitation uses new Enkai Pages image path',()=>{
  const invite=path.join(root,'invite');
  const pages=fs.readdirSync(invite).filter(name=>name.endsWith('.html'));
  assert.ok(pages.length>=40,'Expected existing static restaurant invitation pages');
  for(const page of pages){
    const html=fs.readFileSync(path.join(invite,page),'utf8');
    assert.match(html,/og:site_name" content="Enkai"/);
    assert.ok(html.includes(newBase+'assets/invitations/'),page+' must use new photo URL');
    assert.ok(!html.includes('github.io/'+oldSlug+'/'),page+' has obsolete URL');
  }
});

test('old invitation URLs stay accepted by the native parser without unrelated hosts',()=>{
  const api=require('../native/ios-invites.js');
  const uuid='11111111-1111-4111-8111-111111111111';
  const code=Buffer.from(uuid.replaceAll('-',''),'hex').toString('base64url');
  for(const prefix of ['/enkai/','/nocturne-sao-paulo/']){
    assert.equal(api.parseInviteLink('https://kinhai-collab.github.io'+prefix+'i.html?code='+code),uuid);
    assert.equal(api.parseInviteLink('https://kinhai-collab.github.io'+prefix+'planner.html#invite='+uuid),uuid);
  }
  assert.equal(api.parseInviteLink('https://evil.example/enkai/i.html?code='+code),null);
});

test('legacy browser state and backend sessions are deliberately not renamed',()=>{
  const planner=read('planner.js');
  const backend=read('supabase/functions/meal-planner/index.ts');
  assert.match(planner,/nocturne-planner-session/);
  assert.match(planner,/nocturne-microsoft-flow/);
  assert.match(backend,/nocturne_/);
  assert.match(read('docs/enkai-rename-cutover.md'),/persisted/);
});

test('source files that must switch on cutover contain no old repo slug',()=>{
  for(const file of ['preview-service/core.mjs','native/ios-shell.js',
    'supabase/functions/_shared/calendar-core.ts',
    'supabase/functions/calendar-callback/index.ts',
    'scripts/build_invite_previews.py']){
    assert.equal(read(file).includes(oldSlug),false,file+' still hardcodes old project path');
  }
});
