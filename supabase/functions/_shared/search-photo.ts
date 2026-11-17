import {freshPlacePhoto} from './place-photo.ts';

// Browsing and invitations share the same atomic 900/month photo reservation.
export async function searchPlacePhoto(
  placeId:unknown,
  key:string|undefined,
  reserve:()=>Promise<{data:unknown;error:unknown}>,
  resolve=(id:string,secret:string)=>freshPlacePhoto(id,secret,fetch,undefined,480),
) {
  if(typeof placeId!=='string'||!/^[\w-]{1,255}$/.test(placeId))return {status:400,body:{error:'Photo unavailable.'}};
  if(!key)return {status:503,body:{error:'Restaurant photos are temporarily unavailable.'}};
  let reservation;
  try{reservation=await reserve();}catch{return {status:503,body:{error:'Restaurant photos are temporarily unavailable.'}};}
  if(reservation.error)return {status:503,body:{error:'Restaurant photos are temporarily unavailable.'}};
  if(reservation.data!==true)return {status:429,body:{error:'Photo preview limit reached. You can still add restaurants to your poll.'}};
  try{return {status:200,body:await resolve(placeId,key)};}
  catch{return {status:502,body:{error:'Restaurant photo unavailable.'}};}
}
