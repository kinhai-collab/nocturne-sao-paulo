import {invitationResponse} from '../core.mjs';
export default async function handler(req,res) {
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.setHeader('Allow','GET, HEAD');res.end();return;}
  const response=await invitationResponse(new URL(req.url,'https://preview.invalid'),req.headers['user-agent']||'');
  res.statusCode=response.status;
  response.headers.forEach((value,key)=>res.setHeader(key,value));
  res.end(req.method==='HEAD'?'':await response.text());
}
