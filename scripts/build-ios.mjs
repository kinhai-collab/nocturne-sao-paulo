/**
 * Enkai native asset builder.
 * Copies only public web assets; no database code, GitHub metadata, credentials,
 * build artifacts, or third-party server functions enter the iOS bundle.
 */
import { readdir, mkdir, cp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'www');
const allowed = new Set(['.html', '.js', '.css']);
const directories = ['assets', 'invite'];
const required = ['planner.html','planner.js','planner-mobile.js','config.js',
  'group-finder.js','group-shortlist.js','invitation-sharing.js'];
await rm(out, {recursive:true,force:true});
await mkdir(out,{recursive:true});
const entries=await readdir(root,{withFileTypes:true});
let copied=0;
for(const entry of entries) {
  if(!entry.isFile() || !allowed.has(extname(entry.name))) continue;
  await copyFile(join(root,entry.name),join(out,entry.name));
  copied++;
}
for(const name of directories) {
  await cp(join(root,name),join(out,name),{recursive:true,force:true,
    filter:src=>!src.split(/[/\\]/).some(part=>part==='.git'||part==='node_modules')});
}
for(const name of required) {
  if(!entries.some(entry=>entry.name===name && entry.isFile()))
    throw Error('Missing Enkai runtime file: '+name);
}
let html=await readFile(join(root,'planner.html'),'utf8');
if(!html.includes('<head>')||!html.includes('<script src="planner.js?'))
  throw Error('Planner HTML has changed; review native entrypoint injection');
const anchor=/<script src="planner\.js\?[^"]+" defer><\/script>/;
if(!anchor.test(html))throw Error('Cannot find main planner script');
html=html.replace(anchor,'<script src="ios-invites.js" defer></script>\n' +
  '<script src="ios-shell.js" defer></script>\n$&');
html=html.replace('<title>Enkai · Meal planner</title>',
  '<title>Enkai Beta · Meal planner</title>');
await writeFile(join(out,'index.html'),html);
await copyFile(join(root,'native','ios-invites.js'),join(out,'ios-invites.js'));
await copyFile(join(root,'native','ios-shell.js'),join(out,'ios-shell.js'));
const result=await readFile(join(out,'index.html'),'utf8');
if(!result.includes('<script src="ios-shell.js" defer></script>') ||
  result.indexOf('ios-shell.js')>result.indexOf('planner.js'))
  throw Error('Native auth guard must load before main planner');
console.log('Enkai iOS public bundle prepared: '+copied+' top-level files, plus '+directories.join(', '));
console.log('Native sign-in intentionally held until approved native OAuth is integrated.');
