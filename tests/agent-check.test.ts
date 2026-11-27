import { strict as assert } from 'node:assert';
import { optionsVersion } from '../supabase/functions/_shared/scheduling.ts';

Deno.test('Authenticated agent-check: guest forbidden, canonical Microsoft organizer, coarse responses and no logs', async () => {
  const originalFetch=globalThis.fetch, originalServe=Deno.serve;
  const originalEnvGet=Deno.env.get;
  const syntheticEnv:Record<string,string>={SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'};
  Deno.env.get=key=>syntheticEnv[key];
  let handler:any;
  Deno.serve=((h:any)=>{handler=h;return {};}) as typeof Deno.serve;
  const logs:unknown[][]=[];
  const originalConsole={log:console.log,warn:console.warn,error:console.error};
  for(const key of ['log','warn','error'] as const)console[key]=(...args:unknown[])=>{logs.push(args);};
  let actor='guest',microsoft=false,mode='works',begins=0,saves=0;
  const start='2099-12-25T19:00:00.000Z',meal='11111111-1111-4111-8111-111111111111';
  const hash=await optionsVersion([{start,durationMinutes:90,timeZone:'America/Toronto'}]);
  globalThis.fetch=(async(input:any,init:any={})=>{
    const url=new URL(String(input));
    assert.equal(url.origin,'https://synthetic.invalid','No real network requests');
    if(url.pathname.endsWith('/meal_remembered_sessions'))return Response.json({account:actor,display_name:'Synthetic',microsoft});
    if(url.pathname.endsWith('/meal_microsoft_links'))return Response.json({google_sub:'host'});
    if(url.pathname.endsWith('/meal_calendar_connections'))return Response.json([]);
    if(url.pathname.endsWith('/rpc/meal_agent_begin')) {
      begins++;
      const body=JSON.parse(init.body);
      assert.equal(body.meal,meal);
      if(body.actor!=='host')return Response.json({error:'forbidden'});
      if(mode==='limit')return Response.json({error:'agent_limit'});
      if(mode==='sql-waiting')return Response.json({status:'waiting'});
      return Response.json({input_rev:3,owner:'host',timeZone:mode==='bad-zone'?'Invalid/Zone':mode==='offset-zone'?'+01:00':'America/Toronto',duration:90,times:[start],
        participants:(mode==='waiting'?['host','a']:['host','a','b']).map(memberRef=>({memberRef,times:mode==='none'?[]:[start]}))});
    }
    if(url.pathname.endsWith('/rpc/meal_agent_save')) {
      saves++;
      const body=JSON.parse(init.body);
      assert.equal(body.actor,'host');assert.equal(body.rev,3);assert.equal(body.options_hash,hash);
      if(mode==='stale')return Response.json({error:'stale'});
      // Deliberately include accidental internals to verify the edge's allowlist.
      return Response.json({agentResult:{status:body.status,proposedTime:start,computedAt:'2099-01-01T00:00:00.000Z',optionsVersion:hash,
        input_rev:3,runs_count:1,participants:['PRIVATE_REF'],answers:[true]}});
    }
    throw Error('Unexpected synthetic request: '+url.pathname);
  }) as typeof fetch;
  const call=async(credential=true)=>{
    const response=await handler(new Request('https://synthetic.invalid/functions/v1/meal-planner',{method:'POST',headers:{origin:'https://kinhai-collab.github.io',
      ...(credential?{authorization:'Bearer nocturne_'+'a'.repeat(64)}:{})},body:JSON.stringify({action:'agent-check',id:meal})}));
    return {status:response.status,body:await response.json()};
  };
  try {
    await import('../supabase/functions/meal-planner/index.ts');
    assert(handler);
    assert.equal((await call(false)).status,401);assert.equal(begins,0);
    assert.deepEqual(await call(),{status:403,body:{error:'forbidden'}});assert.equal(saves,0);
    actor='host';
    const works=await call();assert.equal(works.status,200);
    assert.deepEqual(Object.keys(works.body),['agentResult']);
    assert.deepEqual(Object.keys(works.body.agentResult).sort(),['computedAt','optionsVersion','proposedTime','status']);
    assert.equal(works.body.agentResult.proposedTime,start);
    mode='none';
    const none=await call();assert.equal(none.body.agentResult.status,'none');
    assert.deepEqual(Object.keys(none.body.agentResult).sort(),['computedAt','optionsVersion','status']);
    for(const state of ['waiting','sql-waiting','limit','bad-zone','offset-zone','stale']) {
      mode=state;
      const response=await call();
      assert.deepEqual(response.body,state.endsWith('waiting')?{agentResult:{status:'waiting'}}:{error:state==='limit'?'agent_limit':(state==='bad-zone'||state==='offset-zone')?'invalid_options':'stale'});
    }
    microsoft=true;actor='raw-microsoft-sub';mode='works';
    assert.equal((await call()).body.agentResult.status,'works','Linked Microsoft identity uses the canonical Google account');
    assert.deepEqual(logs,[],'No scheduling data or provider errors logged');
  } finally {
    globalThis.fetch=originalFetch;Deno.serve=originalServe;
    Object.assign(console,originalConsole);
    Deno.env.get=originalEnvGet;
  }
});
