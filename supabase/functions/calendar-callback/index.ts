import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {finishConnection,runCalendarJobs} from '../_shared/calendar.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
  if(req.method!=='GET')return new Response('Method not allowed',{status:405});
  let location='https://kinhai-collab.github.io/nocturne-sao-paulo/planner.html?view=settings&calendar=failed';
  try {location=await finishConnection(db,new URL(req.url));}catch {}
  // Persisted jobs survive a worker timeout or a guest closing the browser.
  EdgeRuntime.waitUntil(runCalendarJobs(db).catch(()=>{}));
  return new Response(null,{status:303,headers:{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
});
