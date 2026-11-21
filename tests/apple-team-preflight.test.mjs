import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../scripts/apple-team-preflight.mjs';
const config={appId:'com.kinhai.enkai.beta'};

test('a confirmed team can host Enkai and Mira as separate App IDs',()=>{
  const result=check({appleTeamId:'ABCDEFGHIJ',enkaiBundleId:config.appId,miraBundleId:'com.example.mira'},config);
  assert.equal(result.readyForTeamAssignment,true);
  assert.deepEqual(result.problems,[]);
});

test('never reuse the Mira bundle identifier for Enkai',()=>{
  const result=check({appleTeamId:'ABCDEFGHIJ',enkaiBundleId:config.appId,miraBundleId:config.appId},config);
  assert.equal(result.readyForTeamAssignment,false);
  assert.match(result.problems.join(' '),/Mira bundle identifier/);
});

test('missing team or mismatched app configuration blocks signing setup',()=>{
  const invalid=check({enkaiBundleId:'com.kinhai.another'},config);
  assert.equal(invalid.readyForTeamAssignment,false);
  assert.match(invalid.problems.join(' '),/Team ID/);
  assert.match(invalid.problems.join(' '),/does not match/);
});

test('validity does not claim certificates, identities, TestFlight or native OAuth readiness',()=>{
  const result=check({appleTeamId:'ABCDEFGHIJ',enkaiBundleId:config.appId},config);
  assert.match(result.note,/provisioning/);
  assert.match(result.note,/native sign-in/);
});
