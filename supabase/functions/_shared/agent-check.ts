import { schedulingBusyCheck } from './calendar.ts';
import { CandidatePlan, minimumGroupGate, optionsVersion, runMatcher, ServerDelegate } from './scheduling.ts';

// Called only after the edge's existing identity verification and canonical mapping.
// begin/save also enforce organizer authority; no provider/storage errors cross this boundary.
export async function agentCheck(db: any, actor: string, meal: string) {
  try {
    const { data: inputs, error } = await db.rpc('meal_agent_begin', { meal, actor });
    if (error) return { error: 'unavailable' };
    if (inputs?.error) return { error: ['forbidden', 'unavailable', 'agent_limit'].includes(inputs.error) ? inputs.error : 'unavailable' };
    if (inputs?.status === 'waiting') return { agentResult: { status: 'waiting' } };
    if (minimumGroupGate(inputs.owner, inputs.participants.map((p: any) => p.memberRef)) === 'waiting') return { agentResult: { status: 'waiting' } };
    if (typeof inputs.timeZone !== 'string' || !inputs.timeZone || inputs.timeZone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(inputs.timeZone)) return { error: 'invalid_options' };
    try { new Intl.DateTimeFormat('en', { timeZone: inputs.timeZone }); }
    catch { return { error: 'invalid_options' }; }
    if (!Array.isArray(inputs.times) || !Number.isFinite(inputs.duration) || inputs.duration <= 0 ||
      inputs.times.some((t: unknown) => typeof t !== 'string' || !Number.isFinite(Date.parse(t)) || new Date(t).toISOString() !== t)) return { error: 'invalid_options' };
    const candidates: CandidatePlan[] = inputs.times.map((start: string) => ({ start, durationMinutes: inputs.duration, timeZone: inputs.timeZone }));
    const delegates = await Promise.all(inputs.participants.map(async (p: any) =>
      new ServerDelegate(p.memberRef, p.times, await schedulingBusyCheck(db, p.memberRef, meal))));
    const result = await runMatcher(candidates, delegates, [inputs.owner]);
    const hash = await optionsVersion(candidates);
    const { data: saved, error: saveError } = await db.rpc('meal_agent_save', {
      meal, actor, rev: inputs.input_rev, status: result.status, proposed_time: result.status === 'works' ? result.proposedTime : null, options_hash: hash,
    });
    if (saveError) return { error: 'unavailable' };
    if (saved?.error) return { error: ['forbidden', 'stale', 'invalid_result'].includes(saved.error) ? saved.error : 'unavailable' };
    // Explicit projection even when the service response gains internal fields later.
    const r = saved.agentResult;
    return { agentResult: { status: r.status, ...(r.status === 'works' ? { proposedTime: r.proposedTime } : {}), computedAt: r.computedAt, optionsVersion: r.optionsVersion } };
  } catch { return { error: 'unavailable' }; }
}
