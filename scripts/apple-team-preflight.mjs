/**
 * Read-only Apple team reuse preflight for the Enkai iOS target.
 * Intentionally does not read signing certificates, private keys, provisioning
 * profiles, keychains, App Store Connect credentials or GitHub secrets.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function check(input = {}, configuration = {}) {
  const problems = [];
  const team = String(input.appleTeamId || '').trim().toUpperCase();
  const bundle = String(input.enkaiBundleId || '').trim();
  const mira = String(input.miraBundleId || '').trim();
  const expected = String(configuration.appId || '');
  if (!/^[A-Z0-9]{10}$/.test(team)) problems.push('Apple Team ID not confirmed (expected ten letters or digits).');
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/.test(bundle)) problems.push('Enkai bundle identifier missing or invalid.');
  if (bundle !== expected) problems.push('Enkai bundle ID does not match capacitor.config.json. Review before creating an app record.');
  if (mira && mira === bundle) problems.push('Enkai must not reuse the Mira bundle identifier.');
  return {
    readyForTeamAssignment: problems.length === 0,
    problems,
    note: 'Signing, Apple account privileges, provisioning, beta review, and native sign-in remain unverified.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  const result = check({
    appleTeamId: process.env.APPLE_TEAM_ID,
    enkaiBundleId: process.env.ENKAI_BUNDLE_ID || config.appId,
    miraBundleId: process.env.MIRA_BUNDLE_ID,
  }, config);
  console.log('Enkai Apple Developer team configuration check');
  for (const item of result.problems) console.log('ACTION NEEDED: ' + item);
  console.log(result.note);
  if (!result.readyForTeamAssignment) process.exitCode = 1;
}
