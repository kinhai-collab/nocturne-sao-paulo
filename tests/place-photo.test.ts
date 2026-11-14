import {strict as assert} from 'node:assert';
import {freshPlacePhoto,selectedPlaceId} from '../supabase/functions/_shared/place-photo.ts';

const details={restaurant:'Live restaurant',venues:[{name:'Another',placeId:'wrong'},{name:'Live restaurant',placeId:'ChIJ_test'}]};
Deno.test('Photo is bound to the selected restaurant, never the first poll option',()=>{
  assert.equal(selectedPlaceId(details),'ChIJ_test');
  assert.equal(selectedPlaceId({...details,restaurant:''}),null);
  assert.equal(selectedPlaceId({...details,cancelled:true}),null);
  assert.equal(selectedPlaceId({...details,restaurant:'Unknown'}),null);
  assert.equal(selectedPlaceId({...details,venues:[{name:'Live restaurant',placeId:'../secret'}]}),null);
});

function provider(photo:any={name:'places/ChIJ_test/photos/fresh',googleMapsUri:'https://www.google.com/maps/photo/example',authorAttributions:[{displayName:'Photographer',uri:'https://www.google.com/maps/contrib/123'}]},media:any={photoUri:'https://lh3.googleusercontent.com/restaurant'}) {
  const calls:{url:string;options:RequestInit}[]=[];
  const request=(url:RequestInfo | URL,options:RequestInit={})=>{
    calls.push({url:String(url),options});
    return Promise.resolve(Response.json(calls.length%2===1?{photos:photo?[photo]:[]} : media));
  };
  return {calls,request:request as typeof fetch};
}
Deno.test('Resolve a fresh photo reference each time, resize to 800 and retain credits without exposing the key',async()=>{
  const mock=provider();
  const result=await freshPlacePhoto('ChIJ_test','private-test-key',mock.request);
  await freshPlacePhoto('ChIJ_test','private-test-key',mock.request);
  assert.equal(mock.calls.length,4);
  assert.equal(mock.calls[0].url,mock.calls[2].url);
  assert.equal(mock.calls[0].options.cache,'no-store');
  assert.equal((mock.calls[0].options.headers as Record<string,string>)['X-Goog-FieldMask'],'photos,websiteUri');
  assert.match(mock.calls[1].url,/maxWidthPx=800/);
  assert(!JSON.stringify(result).includes('private-test-key'));
  assert.equal(result.photo?.authors[0].name,'Photographer');
  assert.match(result.photo!.source!,/google.com\/maps\/photo/);
});
Deno.test('No photo is a valid result, and malicious provider URLs/references are rejected',async()=>{
  const empty=provider(null);assert.deepEqual(await freshPlacePhoto('ChIJ_test','key',empty.request),{photo:null});assert.equal(empty.calls.length,1);
  const wrong=provider({name:'places/other/photos/stale'});
  await assert.rejects(()=>freshPlacePhoto('ChIJ_test','key',wrong.request));assert.equal(wrong.calls.length,1);
  const evil=provider(undefined,{photoUri:'https://googleusercontent.com.evil.test/photo'});
  await assert.rejects(()=>freshPlacePhoto('ChIJ_test','key',evil.request));
  const badAuthor=provider({name:'places/ChIJ_test/photos/fresh',googleMapsUri:'javascript:alert(1)',authorAttributions:[{displayName:'Name',uri:'https://evil.test/'}]});
  const clean=await freshPlacePhoto('ChIJ_test','key',badAuthor.request);
  assert.equal(clean.photo?.source,undefined);assert.equal(clean.photo?.authors[0].uri,undefined);
});
Deno.test('Provider errors fail closed without redirecting to arbitrary hosts',async()=>{
  const fail=(()=>Promise.resolve(new Response('Unavailable',{status:503}))) as typeof fetch;
  await assert.rejects(()=>freshPlacePhoto('ChIJ_test','key',fail));
  await assert.rejects(()=>freshPlacePhoto('../etc','key',fail));
});
