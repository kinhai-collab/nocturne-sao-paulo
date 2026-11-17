import {strict as assert} from 'node:assert';
import {searchPlacePhoto} from '../supabase/functions/_shared/search-photo.ts';

Deno.test('A full monthly photo allowance never calls Google or the website resolver',async()=>{
  let calls=0;
  const result=await searchPlacePhoto('valid-place','private-key',()=>Promise.resolve({data:false,error:null}),()=>{calls++;throw Error('Must not run');});
  assert.equal(result.status,429);assert.equal(calls,0);
});
Deno.test('Invalid input or a missing key cannot consume the monthly allowance',async()=>{
  let reservations=0;
  const reserve=()=>{reservations++;return Promise.resolve({data:true,error:null});};
  assert.equal((await searchPlacePhoto('../invalid','key',reserve)).status,400);
  assert.equal((await searchPlacePhoto('place',undefined,reserve)).status,503);
  assert.equal(reservations,0);
});
Deno.test('Quota storage errors fail closed without making paid photo requests',async()=>{
  let calls=0;const resolve=()=>{calls++;return Promise.resolve({photo:null});};
  assert.equal((await searchPlacePhoto('place','key',()=>Promise.resolve({data:true,error:Error('Storage')}),resolve)).status,503);
  assert.equal((await searchPlacePhoto('place','key',()=>Promise.reject(Error('Storage')),resolve)).status,503);
  assert.equal(calls,0);
});
Deno.test('One photo resolution reserves once; missing or failed photos stay independent of voting',async()=>{
  let reservations=0;
  const reserve=()=>{reservations++;return Promise.resolve({data:true,error:null});};
  const photo={photo:{kind:'website',url:'https://restaurant.example/food.jpg',source:'https://restaurant.example/'}};
  const result=await searchPlacePhoto('place','private-key',reserve,(id,key)=>{assert.equal(id,'place');assert.equal(key,'private-key');return Promise.resolve(photo) as any;});
  assert.deepEqual(result,{status:200,body:photo});assert.equal(reservations,1);assert(!JSON.stringify(result).includes('private-key'));
  assert.deepEqual(await searchPlacePhoto('place','key',reserve,()=>Promise.resolve({photo:null})),{status:200,body:{photo:null}});
  assert.equal((await searchPlacePhoto('place','key',reserve,()=>Promise.reject(Error('Provider')))).status,502);
});
