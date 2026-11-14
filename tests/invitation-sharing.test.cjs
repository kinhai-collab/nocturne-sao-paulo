const {strict:assert}=require('node:assert');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('invitation-sharing.js','utf8'),{window,URL,btoa,Intl,Date});
const sharing=window.EnkaiInvites;
const meal={invite:'11111111-1111-4111-8111-111111111111',hostName:'Kin Hai',restaurant:'Yu Seafood',location:'Toronto',selectedTime:'2026-12-24T23:00:00.000Z',timeZone:'America/Toronto',times:[],restaurants:['Yu Seafood']};
test('Known restaurant links preserve the invitation and theme with no guest identifiers',()=>{
  for(const theme of ['supper-club','after-hours']) {
    const url=new URL(sharing.url(meal,{base:'https://example.com/enkai/planner.html',theme,venue:{id:'yu-seafood'}}));
    assert.equal(url.pathname,'/enkai/invite/yu-seafood.html');
    assert.equal(url.searchParams.get('theme'),theme);
    assert.equal(Buffer.from(url.searchParams.get('code'),'base64url').toString('hex'),meal.invite.replaceAll('-',''));
    assert.equal([...url.searchParams].length,2);
  }
});
test('A date is formatted in the destination zone; invitation does not claim a booking',()=>{
  assert.equal(sharing.title(meal),'Kin invited you to dinner at Yu Seafood');
  const text=sharing.text(meal);assert.match(text,/6:00 PM EST/);assert.match(text,/RSVP/);assert(!text.includes('Hai'));assert(!text.includes('booked'));
  assert.equal(sharing.message(meal,'https://example.com/invite').split('https://example.com/invite').length,2);
});
test('A restaurant poll avoids featuring one candidate as the selected restaurant',()=>{
  const poll={...meal,restaurant:'',selectedTime:'',times:['a','b'],restaurants:['A','B','C','D']};
  assert.match(sharing.text(poll),/2 date options/);assert.match(sharing.text(poll),/Options: A, B, C and more/);
  assert.equal(new URL(sharing.url(poll,{base:'https://example.com/planner.html',theme:'after-hours',venue:{id:'yu-seafood'}})).pathname,'/i.html');
});
test('Unknown restaurants have a generic preview; invalid invitations cannot create links',()=>{
  assert.equal(new URL(sharing.url(meal,{base:'https://example.com/planner.html',theme:'invalid'})).pathname,'/i.html');
  assert.throws(()=>sharing.url({...meal,invite:'not-an-invite'},{base:'https://example.com/'}));
  assert(!sharing.title({...meal,hostName:'Your host'}).startsWith('Your invited'));
});
test('Live-search restaurants use a verified configured service, with safe static fallback',()=>{
  const live={...meal,version:3,venues:[{name:meal.restaurant,placeId:'ChIJ_live'}]};
  for(const theme of ['supper-club','after-hours']) {
    const shared=new URL(sharing.url(live,{base:'https://example.com/planner.html',theme,previewBase:'https://preview.example/i'}));
    assert.equal(shared.hostname,'preview.example');assert.equal(shared.pathname,'/i');assert.equal(shared.searchParams.get('theme'),theme);
    assert.equal(shared.searchParams.get('v'),'3');
  }
  assert.equal(new URL(sharing.url(live,{base:'https://example.com/planner.html',previewBase:'javascript:alert(1)'})).pathname,'/i.html');
  assert.equal(new URL(sharing.url({...live,restaurant:''},{base:'https://example.com/planner.html',previewBase:'https://preview.example/i'})).pathname,'/i.html');
});
test('Every generated preview has server-rendered metadata, an existing JPEG and no dinner token',()=>{
  const venues=JSON.parse(fs.readFileSync('planner-venues.js','utf8').split('=').slice(1).join('=').trim().replace(/;$/,''));
  for(const venue of venues) {
    const html=fs.readFileSync('invite/'+venue.id+'.html','utf8');
    assert.match(html,/og:title/);assert.match(html,/og:image/);assert.match(html,/image\/jpeg/);assert.match(html,/no-referrer/);
    assert(!html.includes(meal.invite));assert(!html.includes('code='));
    const image=fs.readFileSync('assets/invitations/'+venue.id+'.jpg');assert.equal(image[0],255);assert.equal(image[1],216);
  }
});
