const {test}=require('node:test');
const {strict:assert}=require('node:assert');
const code=Buffer.from('11111111111141118111111111111111','hex').toString('base64url');
const url='https://preview.example/i?code='+code;
test('Human links redirect to the real app with the invite and both themes, without Google requests',async()=>{
  const {invitationResponse}=await import('../preview-service/core.mjs');
  for(const theme of ['supper-club','after-hours']){
    const response=await invitationResponse(url+'&theme='+theme,'Mozilla/5.0',()=>{throw Error('Must not fetch')});
    assert.equal(response.status,302);const target=new URL(response.headers.get('location'));
    assert.equal(target.hostname,'kinhai-collab.github.io');assert.equal(target.searchParams.get('theme'),theme);
    assert.equal(target.hash,'#invite=11111111-1111-4111-8111-111111111111');
  }
});
test('Crawlers receive personalized server-rendered tags, fresh photos, escaped data and no secrets',async()=>{
  const {invitationResponse}=await import('../preview-service/core.mjs');
  const actions=[];const request=async(_,options)=>{const body=JSON.parse(options.body);actions.push(body.action);assert.equal(options.cache,'no-store');return Response.json(body.action==='preview'?{title:'Dinner',hostName:'Maya <tag>',restaurant:'Sushi & Rice',location:'Toronto',timeZone:'America/Toronto',selectedTime:'2026-12-24T23:00:00.000Z'}:{photo:{url:'https://lh3.googleusercontent.com/fresh',authors:[{name:'Author'}]}})};
  const response=await invitationResponse(url,'WhatsApp/2',request);const html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(html,/Maya invited you to Sushi &amp; Rice/);assert.match(html,/6:00 PM EST/);
  assert.match(html,/<meta property="og:image" content="https:\/\/lh3.googleusercontent.com\/fresh"/);
  assert(!html.includes('<tag>'));assert.deepEqual(actions.sort(),['preview','preview-photo']);
});
test('Unavailable photo falls back; invalid, expired, or incomplete invites reveal no dinner',async()=>{
  const {invitationResponse}=await import('../preview-service/core.mjs');
  const invalid=await invitationResponse('https://preview.example/i?code=bad','WhatsApp',()=>{throw Error('Must not fetch')});assert.equal(invalid.status,400);
  const fallback=await invitationResponse(url,'facebookexternalhit',async(_,o)=>JSON.parse(o.body).action==='preview'?Response.json({title:'Dinner',restaurant:'Live place'}):new Response('',{status:429}));
  assert.match(await fallback.text(),/restaurant photo unavailable/);
  const gone=await invitationResponse(url,'WhatsApp',async()=>new Response('',{status:404}));assert.equal(gone.status,404);
});
