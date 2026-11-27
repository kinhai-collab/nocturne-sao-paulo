const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

let PGlite;
let unavailable = 'Set ENKAI_PGLITE_DIR to an offline PGlite installation.';
if (process.env.ENKAI_PGLITE_DIR) {
  try {
    ({ PGlite } = require(path.join(process.env.ENKAI_PGLITE_DIR, 'node_modules/@electric-sql/pglite')));
  } catch {
    unavailable = 'PGlite is unavailable at ENKAI_PGLITE_DIR.';
  }
}

test('SQL migrations and transactional fixtures in offline PGlite', { skip: PGlite ? false : unavailable }, async t => {
  const db = new PGlite();
  const root = path.resolve(__dirname, '..');
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const migrations = path.join(root, 'supabase/migrations');
    for (const name of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
      try { await db.exec(fs.readFileSync(path.join(migrations, name), 'utf8')); }
      catch (error) { throw new Error('Migration ' + name + ': ' + error.message, { cause: error }); }
    }
    for (const name of fs.readdirSync(__dirname).filter(name => name.endsWith('.sql')).sort()) {
      await t.test(name, async () => {
        await db.exec('begin;');
        try { await db.exec(fs.readFileSync(path.join(__dirname, name), 'utf8')); }
        finally { await db.exec('rollback;'); }
      });
    }
  } finally { await db.close(); }
});
