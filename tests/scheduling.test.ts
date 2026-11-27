import { strict as assert } from 'node:assert';
import { CandidatePlan, minimumGroupGate, optionsVersion, runMatcher, SchedulingDelegate, ServerDelegate } from '../supabase/functions/_shared/scheduling.ts';
const candidates: CandidatePlan[] = ['2026-12-25T19:00:00.000Z', '2026-12-24T19:00:00.000Z'].map(start => ({ start, durationMinutes: 90, timeZone: 'America/Toronto' }));
const delegate = (ref: string, answers: boolean[]): SchedulingDelegate => ({ memberRef: ref, answer: async () => answers });
for (const n of [3, 4, 5, 7, 12]) Deno.test(`two-thirds threshold N=${n}`, async () => {
  const threshold = Math.ceil(2 * n / 3);
  for (const yes of [threshold - 1, threshold]) {
    const ds = Array.from({ length: n }, (_, i) => delegate(String(i), [i < yes, false]));
    assert.deepEqual(await runMatcher(candidates, ds, ['0']), yes === threshold ? { status: 'works', proposedTime: candidates[0].start } : { status: 'none' });
  }
});
Deno.test('organizer veto; required set; first eligible in saved order, never most yes', async () => {
  assert.deepEqual(await runMatcher(candidates, [delegate('host', [false, false]), delegate('a', [true, true]), delegate('b', [true, true])], ['host']), { status: 'none' });
  const ds = [delegate('host', [true, true]), delegate('a', [true, true]), delegate('b', [false, true])];
  const r = await runMatcher(candidates, ds, ['host']);
  assert.deepEqual(r, { status: 'works', proposedTime: candidates[0].start });
  assert.deepEqual(Object.keys(r).sort(), ['proposedTime', 'status']);
  assert.deepEqual(await runMatcher(candidates, ds, ['host', 'a', 'b']), { status: 'works', proposedTime: candidates[1].start });
  assert.deepEqual(await runMatcher([candidates[0]], ds.map(d => delegate(d.memberRef, [true])), ['host']), r);
  assert.deepEqual(Object.keys(await runMatcher([], [], [])), ['status']);
});
Deno.test('ballots require exact canonical matches and calendars can only veto', async () => {
  assert.deepEqual(await new ServerDelegate('a', [candidates[0].start], async () => []).answer(candidates), [true, false]);
  assert.deepEqual(await new ServerDelegate('a', null).answer(candidates), [false, false]);
  assert.deepEqual(await new ServerDelegate('a', []).answer(candidates), [false, false]);
  assert.deepEqual(await new ServerDelegate('a', ['2026-12-25T19:00:00Z']).answer(candidates), [false, false]);
  const ballot = candidates.map(c => c.start);
  assert.deepEqual(await new ServerDelegate('a', ballot, async () => 'incomplete').answer(candidates), [false, false]);
  assert.deepEqual(await new ServerDelegate('a', ballot, async () => { throw Error('private provider error'); }).answer(candidates), [false, false]);
  assert.deepEqual(await new ServerDelegate('a', ballot, async () => [{ start: candidates[0].start, end: '2026-12-25T20:30:00.000Z' }]).answer(candidates), [false, true]);
  // Adjacent half-open intervals are clear on either boundary.
  assert.deepEqual(await new ServerDelegate('a', ballot, async () => [{ start: '2026-12-25T18:00:00.000Z', end: candidates[0].start }, { start: '2026-12-25T20:30:00.000Z', end: '2026-12-25T21:00:00.000Z' }]).answer(candidates), [true, true]);
});
Deno.test('bad delegate vectors fail closed and group gate counts distinct joined nonowners', async () => {
  await assert.rejects(() => runMatcher(candidates, [delegate('a', [true])], ['a']), /answer/);
  await assert.rejects(() => runMatcher(candidates, [], ['a']), /required/);
  await assert.rejects(() => runMatcher(candidates, [delegate('a', [true, true]), delegate('a', [true, true])], ['a']), /Duplicate/);
  assert.equal(minimumGroupGate('host', ['host', 'a', 'a']), 'waiting');
  assert.equal(minimumGroupGate('host', ['a', 'b']), 'ready');
});
Deno.test('optionsVersion hashes the ordered candidate JSON and all plan fields', async () => {
  const hash = await optionsVersion(candidates);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, await optionsVersion([...candidates].reverse()));
  assert.notEqual(hash, await optionsVersion(candidates.map(c => ({ ...c, durationMinutes: 120 }))));
  assert.notEqual(hash, await optionsVersion(candidates.map(c => ({ ...c, timeZone: 'UTC' }))));
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(candidates)));
  assert.equal(hash, Array.from(new Uint8Array(raw), b => b.toString(16).padStart(2, '0')).join(''));
});
