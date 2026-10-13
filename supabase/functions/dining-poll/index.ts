import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12';

const POLL = 'sao-paulo-2026';
const IDS = ['evvai','tuju','d-o-m','fame-osteria','jun-sakamoto','kan-suke','kanoe','kazuo','kinoshita','kuro','mani','murakami','oizumi-sushi','picchi','ryo-gastronomia','tangara-jean-georges'];
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const googleClientId = '701098268942-l2sf5ldelqt3b4q1jro8cppv18bcvdlq.apps.googleusercontent.com';
if (!googleClientId) throw new Error('Google client ID must be configured.');
const origin = 'https://kinhai-collab.github.io';
const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','Vary':'Origin'};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async req=>{
  if (req.headers.get('origin')!==origin) return new Response('Origin not allowed',{status:403});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  try {
    const url=new URL(req.url);
    if(req.method==='GET'){
      if(url.searchParams.get('pollId')!==POLL)return json({error:'Unknown poll.'},400);
      if(url.searchParams.get('action')==='challenge'){
        const nonce=crypto.randomUUID()+crypto.randomUUID();
        const {error}=await db.from('dining_challenges').insert({nonce,origin,poll_id:POLL,expires_at:new Date(Date.now()+600000).toISOString()});
        if(error)return json({error:'Could not prepare sign-in. Please retry.'},503);
        await db.from('dining_challenges').delete().lt('expires_at',new Date().toISOString());
        return json({nonce});
      }
      const {data,error}=await db.rpc('dining_counts',{p_poll:POLL});
      if(error)return json({error:'Could not load results. Please retry.'},503);
      const counts=Object.fromEntries(IDS.map(id=>[id,0]));
      for(const row of data||[])if(IDS.includes(row.restaurant))counts[row.restaurant]=Number(row.votes);
      const {data:participants,error:participantError,count:participantCount}=await db.from('dining_ballots').select('public_initial',{count:'exact'}).eq('poll_id',POLL);
      if(participantError)return json({error:'Could not load participation. Please retry.'},503);
      const initials=(participants||[]).map(row=>row.public_initial).filter(value=>typeof value==='string'&&/^\p{L}$/u.test(value)).sort();
      return json({counts,initials,voterCount:participantCount||0});
    }
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const raw=await req.text();if(raw.length>14000)return json({error:'Ballot too large.'},413);
    const p=JSON.parse(raw);
    if(p.pollId!==POLL||p.origin!==origin)return json({error:'Unknown poll or origin.'},400);
    if(!Array.isArray(p.choices)||p.choices.length<1||p.choices.length>5||new Set(p.choices).size!==p.choices.length||p.choices.some((id:unknown)=>typeof id!=='string'||!IDS.includes(id)))return json({error:'Choose 1-5 distinct restaurants.'},400);
    if(typeof p.credential!=='string'||p.credential.length>10000||typeof p.nonce!=='string'||!/^[a-zA-Z0-9-]{72}$/.test(p.nonce))return json({error:'Invalid sign-in. Please sign in again.'},401);
    let person;
    try {
      const {payload}=await jwtVerify(p.credential,jwks,{algorithms:['RS256'],audience:googleClientId,issuer:['accounts.google.com','https://accounts.google.com'],requiredClaims:['sub','exp','iat']});
      const now=Date.now()/1000;
      if(typeof payload.sub!=='string'||!/^\d{1,255}$/.test(payload.sub)||payload.email_verified!==true||typeof payload.email!=='string'||payload.nonce!==p.nonce||typeof payload.iat!=='number'||payload.iat>now+60||payload.azp&&payload.azp!==googleClientId)throw new Error();
      person=payload;
    }catch{return json({error:'Google sign-in could not be verified. Please sign in again.'},401);}
    const {error}=await db.rpc('dining_cast_ballot',{p_poll:POLL,p_sub:person.sub,p_name:typeof person.name==='string'?person.name:'',p_email:person.email,p_choices:p.choices,p_nonce:p.nonce,p_origin:origin,p_publish_initial:p.publishInitial===true});
    if(error){const permitted=['Sign-in expired. Please sign in again.','This Google account has already submitted a different ballot.'];return json({error:permitted.includes(error.message)?error.message:'Could not save ballot. Please retry.'},409);}
    return json({ok:true});
  }catch{return json({error:'Could not process this request. Please retry.'},400);}
});
