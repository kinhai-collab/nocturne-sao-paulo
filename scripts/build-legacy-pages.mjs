/**
 * Generate a compatibility-only Pages artifact for a separately provisioned
 * kinhai-collab/kinhai-collab.github.io *user* site.
 * Run locally/CI, then publish the CONTENTS of legacy-pages/ in that site.
 * This script does not deploy, rename, request credentials or change DNS.
 */
import {readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const output=join(root,'legacy-pages');
const oldPrefix='/nocturne-sao-paulo/';
const newPrefix='/enkai/';
const origin='https://kinhai-collab.github.io';
const names=['index.html','planner.html','i.html','nocturne.html','beyond.html','ontario.html'];
const invites=(await readdir(join(root,'invite'))).filter(name=>/^[a-z0-9-]+\.html$/.test(name));

function page(route) {
  const target=origin+newPrefix+route;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="referrer" content="no-referrer">',
    '<title>Enkai moved</title>',
    '<link rel="canonical" href="'+target+'"></head><body>',
    '<p>Enkai has moved. <a href="'+target+'">Open Enkai</a>.</p>',
    '<script>',
    // Keep opaque invitation token and URL fragment without logging or alteration.
    'location.replace('+JSON.stringify(target)+'+location.search+location.hash);',
    '</script></body></html>',
  ].join('\n');
}
await rm(output,{recursive:true,force:true});
await mkdir(join(output,'nocturne-sao-paulo','invite'),{recursive:true});
await Promise.all(names.map(name=>writeFile(join(output,'nocturne-sao-paulo',name),page(name),'utf8')));
await Promise.all(invites.map(name=>writeFile(join(output,'nocturne-sao-paulo','invite',name),page('invite/'+name),'utf8')));
const fallback=[
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="robots" content="noindex,nofollow">',
  '<meta name="referrer" content="no-referrer">',
  '<title>Enkai moved</title></head><body>',
  '<p>Enkai moved. <a href="'+origin+newPrefix+'">Open Enkai</a>.</p>',
  '<script>',
  '(() => {',
  '  const path=location.pathname;',
  '  const prefix='+JSON.stringify(oldPrefix)+';',
  '  if(!path.startsWith(prefix))return;',
  '  const suffix=path.slice(prefix.length);',
  "  if(!/^(?:|index\\.html|planner\\.html|i\\.html|nocturne\\.html|beyond\\.html|ontario\\.html|invite\\/[a-z0-9-]+\\.html)$/.test(suffix))return;",
  '  location.replace('+JSON.stringify(origin+newPrefix)+'+suffix+location.search+location.hash);',
  '})();',
  '</script></body></html>',
].join('\n');
await writeFile(join(output,'404.html'),fallback,'utf8');
console.log('Prepared '+(names.length+invites.length+1)+' standalone legacy redirect HTML files in legacy-pages/.');
console.log('NOT deployed. Provision and validate the separate GitHub Pages user site first.');
