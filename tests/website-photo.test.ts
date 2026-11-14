import {strict as assert} from 'node:assert';
import {publicAddress,publicUrl,websiteImage,officialWebsitePhoto,unchunk} from '../supabase/functions/_shared/website-photo.ts';
import {Buffer} from 'node:buffer';
import {freshPlacePhoto} from '../supabase/functions/_shared/place-photo.ts';
Deno.test('Restaurant website fetch rejects local addresses, private DNS and unsafe URLs',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','172.16.0.1','::1','999.1.1.1'])assert(!publicAddress(address));
  assert(publicAddress('8.8.8.8'));
  for(const value of ['http://restaurant.example/','https://user:password@restaurant.example/','https://restaurant.example:444/'])await assert.rejects(()=>publicUrl(value,()=>Promise.resolve(['8.8.8.8'])));
  await assert.rejects(()=>publicUrl('https://restaurant.example/',()=>Promise.resolve(['8.8.8.8','10.0.0.1'])));
});
Deno.test('Read website Open Graph or Twitter image without downloading it; resolve relative image URLs',()=>{
  assert.equal(websiteImage('<META content="/food.jpg?a=1&amp;b=2" property="og:image">','https://restaurant.example/menu'),'https://restaurant.example/food.jpg?a=1&b=2');
  assert.equal(websiteImage('<meta name="twitter:image" content="https://cdn.example/food.jpg">','https://restaurant.example/'),'https://cdn.example/food.jpg');
  assert.equal(websiteImage('<head><title>No photo</title></head>','https://restaurant.example/'),null);
});
Deno.test('Official image is credited to the restaurant; unsafe image destinations are rejected',async()=>{
  const read=()=>Promise.resolve({html:'<meta property="og:image" content="/food.jpg">',url:'https://restaurant.example/'});
  const result=await officialWebsitePhoto('https://restaurant.example/',read,value=>publicUrl(value,()=>Promise.resolve(['8.8.8.8'])));
  assert.equal(result.photo?.kind,'website');assert.equal(result.photo?.source,'https://restaurant.example/');
  await assert.rejects(()=>officialWebsitePhoto('https://restaurant.example/',read,()=>Promise.reject(Error('Private address'))));
});
Deno.test('When Google has no photo, look up the website fresh; failure is a valid empty photo',async()=>{
  const provider=(()=>Promise.resolve(Response.json({websiteUri:'https://restaurant.example/'}))) as typeof fetch;
  const result=await freshPlacePhoto('test','key',provider,()=>Promise.resolve({photo:{kind:'website',url:'https://cdn.example/food.jpg',source:'https://restaurant.example/',authors:[]}}));
  assert.equal(result.photo?.kind,'website');
  assert.deepEqual(await freshPlacePhoto('test','key',provider,()=>Promise.reject(Error('Timeout'))),{photo:null});
});
Deno.test('HTTP chunks preserve metadata across boundaries, including incomplete last chunks',()=>{
  assert.equal(unchunk(Buffer.from('5\r\n<meta\r\n4;ext=1\r\n tag\r\n0\r\n\r\n')).toString(),'<meta tag');
  assert.equal(unchunk(Buffer.from('5\r\nabc')).toString(),'abc');
  assert.throws(()=>unchunk(Buffer.from('zz\r\nabc')));
});
