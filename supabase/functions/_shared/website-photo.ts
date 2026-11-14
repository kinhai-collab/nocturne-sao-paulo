import {resolve4} from 'node:dns/promises';
import {Buffer} from 'node:buffer';
import {BlockList,isIP} from 'node:net';
import {Parser} from 'npm:htmlparser2@10.0.0';

const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as [string,number][])blocked.addSubnet(ip,bits);
export function publicAddress(ip:string) {return isIP(ip)===4&&!blocked.check(ip,'ipv4');}
export async function publicUrl(value:string, resolver:(host:string)=>Promise<string[]>=resolve4) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.hostname.length>253||!url.hostname.includes('.'))throw Error('Unsupported website.');
  const addresses=await resolver(url.hostname);
  if(!addresses.length||addresses.some(ip=>!publicAddress(ip)))throw Error('Unsupported website.');
  return {url,address:addresses[0]};
}
// Resolve and pin a public IPv4 address per redirect. Never forward cookies/keys.
async function websiteHead(value:string,redirects=0,deadline=Date.now()+6500):Promise<{html:string;url:string}> {
  if(redirects>3)throw Error('Too many redirects.');
  const remaining=()=>Math.max(1,deadline-Date.now());
  const {url,address}=await publicUrl(value,(host)=>Promise.race([resolve4(host),new Promise<string[]>((_,reject)=>setTimeout(()=>reject(Error('DNS timeout.')),Math.min(2000,remaining())))]));
  if(Date.now()>=deadline)throw Error('Website timeout.');
  // Supabase's Node HTTPS compatibility layer cannot pin DNS while preserving
  // TLS SNI. Native startTls verifies the restaurant hostname over a pinned IP.
  let connection:Deno.Conn|null=null;
  let expired=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;try{connection?.close();}catch{}reject(Error('Website timeout.'));},remaining());});
  const read=async()=>{
    const tcp=await Deno.connect({hostname:address,port:443});connection=tcp;
    if(expired){connection.close();throw Error('Website timeout.');}
    connection=await Deno.startTls(tcp,{hostname:url.hostname,alpnProtocols:['http/1.1']});
    const message=new TextEncoder().encode('GET '+url.pathname+url.search+' HTTP/1.1\r\nHost: '+url.hostname+'\r\nUser-Agent: EnkaiRestaurantPreview/1.0\r\nAccept: text/html\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n');
    let written=0;while(written<message.length)written+=await connection.write(message.subarray(written));
    let raw=Buffer.alloc(0),offset=-1,status=0,headers:Record<string,string>={};
    const buffer=new Uint8Array(16384);
    while(raw.length<512000){
      const size=await connection.read(buffer);if(size===null)break;
      raw=Buffer.concat([raw,Buffer.from(buffer.subarray(0,size))]);
      if(offset<0){
        const end=raw.indexOf('\r\n\r\n');if(end<0){if(raw.length>16384)throw Error('Website headers too large.');continue;}
        const lines=raw.subarray(0,end).toString().split('\r\n');status=Number(lines.shift()?.split(' ')[1]);
        for(const line of lines){const colon=line.indexOf(':');if(colon>0)headers[line.slice(0,colon).toLowerCase()]=line.slice(colon+1).trim();}
        offset=end+4;
        if(status>=300&&status<400&&headers.location)return {status,location:headers.location,type:'',html:''};
        if(status!==200||!headers['content-type']?.includes('text/html')||(headers['content-encoding']&&headers['content-encoding']!=='identity'))throw Error('Website unavailable.');
      }
      const body=raw.subarray(offset);
      const html=(headers['transfer-encoding']?.toLowerCase().includes('chunked')?unchunk(body):body).toString('utf8');
      if(/<\/html\s*>/i.test(html)||raw.length>=512000)return {status,type:headers['content-type'],html};
    }
    if(offset<0)throw Error('Website unavailable.');
    const body=raw.subarray(offset);
    return {status,type:headers['content-type'],html:(headers['transfer-encoding']?.toLowerCase().includes('chunked')?unchunk(body):body).toString('utf8')};
  };
  let response;
  try{response=await Promise.race([read(),timeout]);}finally{clearTimeout(timer);try{(connection as Deno.Conn|null)?.close();}catch{}}
  if(response.location)return websiteHead(new URL(response.location,url).href,redirects+1,deadline);
  return {html:response.html,url:url.href};
}
export function unchunk(body:Buffer):Buffer {
  let offset=0;const pieces:Buffer[]=[];
  while(offset<body.length){
    const end=body.indexOf('\r\n',offset);if(end<0)break;
    const line=body.subarray(offset,end).toString().split(';')[0];if(!/^[a-f\d]{1,8}$/i.test(line))throw Error('Invalid website response.');
    const size=parseInt(line,16);if(!size)break;offset=end+2;
    pieces.push(body.subarray(offset,Math.min(offset+size,body.length)));
    if(offset+size+2>body.length)break;offset+=size+2;
  }
  return Buffer.concat(pieces);
}
const branding=/\b(?:logo|logotype|wordmark|favicon|icon|sprite|badge|avatar|tracking|pixel|placeholder|spinner|loading)\b/i;
const food=/\b(?:food|dish|dishes|pasta|pizza|sushi|dim[ -]?sum|steak|seafood|noodles|dumplings|dessert|tiramisu|cocktail|cuisine|plated|grilled|ramen|sashimi|burrata|carbonara)\b/i;
const rooms=/\b(?:interior|exterior|dining[ -]?room|restaurant[ -]?room|terrace|patio|rooftop|ambiance|ambience|tables)\b/i;
const voidTags=new Set(['img','meta','source','link','br','hr','input','area','base','embed','param','track','wbr']);
function responsiveImage(attrs:Record<string,string>) {
  const set=attrs['data-srcset']||attrs.srcset||'';
  // URLs may contain commas (for example Cloudflare transforms), so split at
  // width/density descriptors rather than splitting each comma in the URL.
  const options=[...set.matchAll(/(\S+)\s+(\d+(?:\.\d+)?)(w|x)(?:\s*,|\s*$)/g)]
    .map(match=>({url:match[1],width:Number(match[2])*(match[3]==='x'?800:1)}))
    .sort((a,b)=>Math.abs(a.width-800)-Math.abs(b.width-800));
  return options[0]?.url||attrs['data-src']||attrs['data-lazy-src']||attrs.src||'';
}
export function websiteImages(html:string,base:string) {
  const candidates:{url:string;score:number;label:string}[]=[];
  const stack:{name:string;context:string;blocked:boolean}[]=[];
  const meta:Record<string,string>={};
  const add=(value:string,label:string,context:string,baseScore:number,width=0,height=0)=>{
    try{
      const url=new URL(value,base);
      const signal=decodeURIComponent(url.pathname)+' '+label+' '+context;
      if(!value||url.protocol!=='https:'||/\.svg(?:$|[?#])/i.test(url.pathname)||branding.test(signal)||
        (width>0&&width<300)||(height>0&&height<180))return;
      if(!food.test(label)&&/\b(?:menu|gift[ -]?card|newsletter|coupon|poster|flyer|qr[ -]?code)\b/i.test(label))return;
      let score=baseScore+(food.test(signal)?120:rooms.test(signal)?65:0);
      if(/\b(?:hero|gallery|parallax|cover|slider)\b/i.test(context))score+=25;
      if(width>=600&&height>=300)score+=10;
      if(/blur=|(?:width|height)[=/](?:16|32|64)(?:\D|$)/i.test(url.href))return;
      candidates.push({url:url.href,score,label});
    }catch{ /* Ignore malformed or non-image URLs. */ }
  };
  const parser=new Parser({onopentag(name,attrs){
    const parent=stack[stack.length-1];
    const context=[parent?.context,attrs.class,attrs.id,attrs['data-snippet'],attrs.role].filter(Boolean).join(' ').slice(-1500);
    const blocked=Boolean(parent?.blocked||['header','footer','nav'].includes(name)||['navigation','contentinfo'].includes(attrs.role)||attrs['aria-hidden']==='true');
    if(name==='meta'){
      const property=(attrs.property||attrs.name||'').toLowerCase();
      if(property.startsWith('og:image')||property.startsWith('twitter:image'))meta[property]??=attrs.content||'';
    }
    if(name==='img'&&!blocked)add(responsiveImage(attrs),[attrs.alt,attrs.title,attrs['aria-label']].filter(Boolean).join(' '),context,35,parseInt(attrs.width)||0,parseInt(attrs.height)||0);
    if(!voidTags.has(name))stack.push({name,context,blocked});
  },onclosetag(name){const index=stack.map(item=>item.name).lastIndexOf(name);if(index>=0)stack.splice(index);}});
  parser.write(html);parser.end();
  add(meta['og:image']||meta['og:image:secure_url'],meta['og:image:alt']||'','',45,Number(meta['og:image:width'])||0,Number(meta['og:image:height'])||0);
  add(meta['twitter:image'],meta['twitter:image:alt']||meta['og:image:alt']||'','',40);
  const seen=new Set<string>();
  return candidates.sort((a,b)=>b.score-a.score).filter(item=>!seen.has(item.url)&&Boolean(seen.add(item.url)));
}
export function websiteImage(html:string,base:string) {return websiteImages(html,base)[0]?.url||null;}
export async function officialWebsitePhoto(value:string,read=websiteHead,validate=publicUrl) {
  const address=new URL(value);
  // Many business listings still use an old HTTP URL. Fetch its HTTPS equivalent.
  if(address.protocol==='http:')address.protocol='https:';
  const page=await read(address.href);
  for(const image of websiteImages(page.html,page.url).slice(0,4)){
    try{await validate(image.url);}catch{continue;}
    return {photo:{kind:'website',url:image.url,source:page.url,authors:[]}};
  }
  return {photo:null};
}
