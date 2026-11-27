// Pure scheduling contract. No storage, provider, transport or logging dependencies.
export type CandidatePlan = { start: string; durationMinutes: number; timeZone: string };
export interface SchedulingDelegate {
  readonly memberRef: string;
  answer(candidates: CandidatePlan[]): Promise<boolean[]>;
}
export type BusyInterval = { start: string; end: string };
export type BusyCheck = (candidates: CandidatePlan[]) => Promise<BusyInterval[] | 'incomplete'>;
export class ServerDelegate implements SchedulingDelegate {
  private readonly starts: Set<string>;
  constructor(readonly memberRef: string, ballotStarts: string[] | null | undefined, private readonly busyCheck: BusyCheck | null = null) {
    this.starts = new Set(ballotStarts || []);
  }
  async answer(candidates: CandidatePlan[]): Promise<boolean[]> {
    let busy: BusyInterval[] = [];
    if (this.busyCheck) {
      try {
        const checked = await this.busyCheck(candidates);
        if (checked === 'incomplete') return candidates.map(() => false);
        busy = checked;
        if (!busy.every(i => Number.isFinite(Date.parse(i.start)) && Date.parse(i.end) > Date.parse(i.start))) return candidates.map(() => false);
      } catch { return candidates.map(() => false); }
    }
    return candidates.map(c => {
      const start = Date.parse(c.start), end = start + c.durationMinutes * 60000;
      return this.starts.has(c.start) && Number.isFinite(start) && new Date(start).toISOString() === c.start && Number.isFinite(c.durationMinutes) && c.durationMinutes > 0 &&
        !busy.some(i => start < Date.parse(i.end) && end > Date.parse(i.start));
    });
  }
}
export type MatchResult = { status: 'works'; proposedTime: string } | { status: 'none' };
export async function runMatcher(candidates: CandidatePlan[], delegates: SchedulingDelegate[], requiredRefs: readonly string[]): Promise<MatchResult> {
  if (new Set(delegates.map(d => d.memberRef)).size !== delegates.length) throw Error('Duplicate delegate');
  const required = new Set(requiredRefs);
  if ([...required].some(ref => !delegates.some(d => d.memberRef === ref))) throw Error('Missing required delegate');
  const answers = await Promise.all(delegates.map(d => d.answer(candidates)));
  if (answers.some(a => a.length !== candidates.length || a.some(v => typeof v !== 'boolean'))) throw Error('Invalid delegate answer');
  const threshold = Math.max(required.size, Math.ceil(2 * delegates.length / 3));
  for (let i = 0; i < candidates.length; i++) {
    if (delegates.every((d, n) => !required.has(d.memberRef) || answers[n][i]) &&
      answers.reduce((sum, a) => sum + Number(a[i]), 0) >= threshold) return { status: 'works', proposedTime: candidates[i].start };
  }
  return { status: 'none' };
}
export function minimumGroupGate(organizerRef: string, joinedRefs: readonly string[]): 'ready' | 'waiting' {
  return new Set(joinedRefs.filter(ref => ref !== organizerRef)).size >= 2 ? 'ready' : 'waiting';
}
export async function optionsVersion(candidates: CandidatePlan[]): Promise<string> {
  const ordered = candidates.map(c => ({ start: c.start, durationMinutes: c.durationMinutes, timeZone: c.timeZone }));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ordered)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
