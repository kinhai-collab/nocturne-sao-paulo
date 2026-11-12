import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {digest,runCalendarJobs} from '../_shared/calendar.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
  const secret=Deno.env.get('CALENDAR_WORKER_SECRET');
  if(req.method!=='POST'||!secret||await digest(req.headers.get('authorization')||'')!==await digest('Bearer '+secret))return new Response('Unauthorized',{status:401});
  try {await runCalendarJobs(db,undefined,5);return Response.json({ok:true});}
  catch {return Response.json({error:'Calendar sync will retry.'},{status:503});}
});
