/**
 * One-time, strictly scoped GitHub Pages path migration for the Enkai repo.
 * Execute on the dedicated rename branch only. Idempotent.
 *
 * Purpose: update repository-name/path references in code, docs, tests,
 * and generated invitation HTML. This does not rename the GitHub repository,
 * reconfigure OAuth providers, or deploy Supabase/Vercel.
 *
 * DO NOT rename legacy localStorage/session keys, historical theme selectors,
 * poll IDs, SQL table names, or earlier credential tokens. Those are persisted
 * identifiers; changing them is a different, backwards-compatible migration.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, extname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const OLD = 'nocturne-sao-paulo';
const NEW = 'enkai';
const extensions = new Set(['.md','.html','.js','.mjs','.cjs','.ts','.py','.json','.yml','.yaml','.css','.txt','.sql','.toml']);
const excluded = new Set([
  'scripts/migrate-repository-name.mjs',
  'docs/enkai-rename-cutover.md',
  '.github/workflows/rename-migration.yml',
  // Handled separately to preserve acceptance of old existing invitation links.
  'native/ios-invites.js',
  'tests/ios-foundation.test.cjs',
  'tests/enkai-rename.test.cjs',
  // README explicitly documents the *old live* URL during the cutover.
  'README.md',
]);
let examined=0,updated=[];
async function walk(dir) {
  for (const item of await readdir(dir,{withFileTypes:true})) {
    const file=join(dir,item.name), path=relative(root,file).replaceAll('\\','/');
    if (item.isDirectory()) {
      if(['.git','node_modules','www','ios','legacy-pages'].includes(item.name))continue;
      await walk(file);
    } else if (item.isFile() && extensions.has(extname(item.name)) && !excluded.has(path)) {
      examined++;
      const before=await readFile(file,'utf8');
      if(!before.includes(OLD))continue;
      const after=before.replaceAll(OLD,NEW);
      if (after !== before) {
        await writeFile(file,after,'utf8');
        updated.push(path);
      }
    }
  }
}
await walk(root);
updated.sort();
console.log('Enkai rename migration: examined '+examined+' text files; changed '+updated.length+'.');
for (const path of updated) console.log('  '+path);
if (updated.some(path=>path.startsWith('assets/') && !path.endsWith('.json') && !path.endsWith('.txt')))
  throw Error('Unexpected asset change');
