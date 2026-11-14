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
  assert.deepEqual(await officialWebsitePhoto('https://restaurant.example/',read,()=>Promise.reject(Error('Private address'))),{photo:null});
});
Deno.test('Prefer food, then restaurant interiors, and reject branded metadata even with opaque URLs',()=>{
  const html='<meta property="og:image" content="https://cdn.example/opaque-brand"><meta property="og:image:alt" content="Gusto 101 logo"><header><img src="/header.jpg" alt="Logo"></header><main><div class="hero"><img src="/room.jpg" alt="Dining room"></div><img src="/dishes.jpg" alt="Fresh pasta and seafood"></main>';
  assert.equal(websiteImage(html,'https://restaurant.example/'),'https://restaurant.example/dishes.jpg');
  assert.equal(websiteImage(html.replace('<img src="/dishes.jpg" alt="Fresh pasta and seafood">',''),'https://restaurant.example/'),'https://restaurant.example/room.jpg');
  assert.equal(websiteImage('<meta property="og:image" content="https://cdn.example/123"><meta property="og:image:alt" content="Restaurant logo">','https://restaurant.example/'),null);
});
Deno.test('Use full lazy-loaded photos, skip trackers/menu graphics, and parse responsive URLs with commas',()=>{
  const html='<img width="1" height="1" src="/tracker.jpg"><img src="/menu.jpg" alt="Lunch Menu"><main><div class="hero"><img src="/blur.jpg?width=32" data-src="/restaurant.jpg"></div></main>';
  assert.equal(websiteImage(html,'https://restaurant.example/'),'https://restaurant.example/restaurant.jpg');
  assert.equal(websiteImage('<img alt="Pasta dish" data-srcset="https://cdn.example/photo/fit=contain,width=375 375w, https://cdn.example/photo/fit=contain,width=800 800w, https://cdn.example/photo/fit=contain,width=1440 1440w">','https://restaurant.example/'),'https://cdn.example/photo/fit=contain,width=800');
});
Deno.test('An unsafe preferred candidate does not prevent using a safe restaurant photo',async()=>{
  const read=()=>Promise.resolve({html:'<img alt="Pasta" src="https://private.example/food.jpg"><img alt="Dining room" src="https://public.example/room.jpg">',url:'https://restaurant.example/'});
  const result=await officialWebsitePhoto('https://restaurant.example/',read,(url)=>url.includes('private.')?Promise.reject(Error('Private address')):Promise.resolve({url:new URL(url),address:'8.8.8.8'}));
  assert.equal(result.photo?.url,'https://public.example/room.jpg');
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
