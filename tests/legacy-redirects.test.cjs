'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const base=path.resolve(__dirname,'..','legacy-pages');
const prefix='https://kinhai-collab.github.io/';
const old=prefix+'nocturne-sao-paulo/';
const current=prefix+'enkai/';

function simulate(rel,source) {
  const html=fs.readFileSync(path.join(base,rel),'utf8');
  const code=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(code,'redirect needs browser script: '+rel);
  let redirect=null;
  const url=new URL(source);
  const location={
    pathname:url.pathname,
    search:url.search,
    hash:url.hash,
    replace:next=>{redirect=next;}
  };
  vm.runInNewContext(code,{location});
  return redirect;
}

test('generates a compatibility file for each known invitation page',()=>{
  const oldDir=path.join(base,'nocturne-sao-paulo');
  for(const name of ['index.html','planner.html','i.html','nocturne.html','beyond.html','ontario.html']){
    assert.ok(fs.existsSync(path.join(oldDir,name)),name);
  }
  const actual=fs.readdirSync(path.join(oldDir,'invite')).filter(x=>x.endsWith('.html'));
  const expected=fs.readdirSync(path.resolve(__dirname,'..','invite')).filter(x=>x.endsWith('.html'));
  assert.deepEqual(actual.sort(),expected.sort());
});

test('old full invitation links preserve query and fragment client-side',()=>{
  const examples=[
    ['nocturne-sao-paulo/i.html','i.html'],
    ['nocturne-sao-paulo/planner.html','planner.html'],
    ['nocturne-sao-paulo/invite/evvai.html','invite/evvai.html'],
    ['nocturne-sao-paulo/index.html','index.html'],
  ];
  const code='AbCdEf123_-abcDEF123_2';
  const frag='#invite=11111111-1111-4111-8111-111111111111';
  for(const [legacy,newPath] of examples){
    const url=prefix+legacy+'?code='+code+'&theme=after-hours'+frag;
    assert.equal(simulate(legacy,url),current+newPath+'?code='+code+'&theme=after-hours'+frag);
  }
});

test('old-path fallback redirects only recognized routes and never to user-chosen host',()=>{
  const source=old+'invite/evvai.html?code=opaque#meal=123';
  assert.equal(simulate('404.html',source),current+'invite/evvai.html?code=opaque#meal=123');
  assert.equal(simulate('404.html',prefix+'unrelated-path?url=https://evil.example'),null);
  assert.equal(simulate('404.html',old+'../evil.html?next=https://evil.example'),null);
  assert.equal(simulate('404.html',old+'some-unknown-file.json'),null);
});

test('legacy redirect bundle does not embed family tokens or API credentials',()=>{
  const file=fs.readFileSync(path.join(base,'nocturne-sao-paulo','i.html'),'utf8');
  assert.doesNotMatch(file,/Bearer |PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY|googleClientId/);
  assert.match(file,/location\.search\+location\.hash/);
  assert.doesNotMatch(file,/console\.log|fetch\(/);
  assert.match(file,/no-referrer/);
});
