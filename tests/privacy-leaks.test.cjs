const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { derive } = require('../dinner-state.js');
const { renderDinner, baseMeal, first, section, escape, finalPlan, mealDateTime, planner, mobile, calendar } = require('./helpers/dinner-render.cjs');

const legacy = {
  hasOtherResponses: true, joinedCount: 37,
  responses: [{ name: 'Private peer', vote: { times: ['PRIVATE_PEER_TIME'], restaurants: ['Cedar'] } }],
  restaurantTallies: [{ value: 'Cedar', count: 1, names: ['Private peer'] }],
  attendanceResponses: [{ name: 'Tentative peer', attendance: 'maybe' }, { name: 'Declined peer', attendance: 'declined' }],
};
const noPeerLeak = output => assert.doesNotMatch(output,
  /Private peer|PRIVATE_PEER_TIME|Tentative peer|Declined peer|can make it|Time options|Time votes|\d+ (?:time options|availability responses|saved responses|joined via link)|Waiting on \d|People & responses/i);

test('organizer and guest details ignore legacy peer availability in polls, receipts and final plans', () => {
  for (const organizer of [true, false]) for (const final of [true, false]) for (const receipt of [true, false]) {
    const meal = baseMeal({ ...legacy, organizer, myVote: { times: [], restaurants: [], ...(final ? { attendance: 'going' } : {}) },
      ...(final ? { selectedTime: first, restaurant: 'Cedar' } : {}) });
    const html = renderDinner(meal, receipt);
    noPeerLeak(html);
    assert.doesNotMatch(html, /host can see|organizer can see/i);
    if (receipt) {
      assert.match(html, /Other guests and your host never see your availability. Enkai processes it to find a time and deletes it after the dinner\./);
      assert.match(html, /Only Going is shown to other guests\./);
    }
    if (!receipt && final && !organizer) assert.match(html, /Choosing Going shares your name with dinner participants/);
    for (const option of html.matchAll(/<option value="2026[^>]*>([^<]*)<\/option>/g)) assert.doesNotMatch(option[1], /votes|count|leading/i);
    if (organizer && !final) assert.match(html, /Restaurant votes[\s\S]*Cedar[\s\S]*1 vote/);
    const output = derive(meal, { now: '2026-11-26T12:00:00Z' });
    noPeerLeak(JSON.stringify(output));
    for (const key of ['times', 'noneCounts', 'leadingTime', 'tiedTimes', 'otherResponseCount']) {
      assert(!(key in output)); assert(!(key in output.tallies));
    }
  }
});

test('home cards contain no counts, named waiting status or peer choices and tolerate absent legacy fields', () => {
  const context = vm.createContext({ hostChoices: new Map(), escape, dinnerState: meal => derive(meal, { now: '2026-11-26' }),
    venueImage: () => '', statusPill: escape, mealDateTime: value => value, durationLabel: () => '90 minutes',
    destinationLabel: () => 'Toronto time', finalPlan: meal => Boolean(meal.selectedTime && meal.restaurant),
    availabilitySaved: vote => Boolean(vote), attendanceLabels: { going: 'Going' } });
  vm.runInContext(section(planner, 'function card(', '\nfunction dashboard('), context);
  for (const organizer of [true, false]) {
    const html = context.card(baseMeal({ ...legacy, organizer }));
    noPeerLeak(html);
    if (organizer) assert.match(html, /Responses are private/);
    noPeerLeak(context.card(baseMeal({ organizer, responses: undefined })));
    noPeerLeak(renderDinner(baseMeal({ organizer, responses: undefined, joinedCount: undefined })));
  }
});

test('current dashboard, details and derived state never read compatibility fields', () => {
  const context = vm.createContext({ hostChoices: new Map(), escape, dinnerState: meal => derive(meal, { now: '2026-11-26' }),
    venueImage: () => '', statusPill: escape, mealDateTime: value => value, durationLabel: () => '90 minutes',
    destinationLabel: () => 'Toronto time', finalPlan, availabilitySaved: vote => Boolean(vote),
    attendanceLabels: { going: 'Going' } });
  vm.runInContext(section(planner, 'function card(', '\nfunction dashboard('), context);
  for (const organizer of [true, false]) for (const final of [true, false]) {
    const meal = baseMeal({ organizer, hasOtherResponses: true,
      ...(final ? { selectedTime: first, restaurant: 'Cedar' } : {}) });
    for (const key of ['responses', 'joinedCount']) {
      Object.defineProperty(meal, key, { get() { assert.fail('Legacy field read: ' + key); } });
    }
    assert.doesNotThrow(() => derive(meal));
    assert.doesNotThrow(() => context.card(meal));
    for (const receipt of [true, false]) assert.doesNotThrow(() => renderDinner(meal, receipt));
  }
});

test('only organizers retain manual attendees after de-duplicated Going names', () => {
  const context = vm.createContext({ finalPlan });
  vm.runInContext(section(planner, 'function attendingGuests(', '\nfunction card('), context);
  const attendees = meal => Array.from(context.attendingGuests(meal));
  const meal = baseMeal({ selectedTime: first, restaurant: 'Cedar', attending: ['Manual guest', 'Going guest', 'Manual guest', 'Tentative peer'],
    attendanceResponses: [{ name: 'Going guest', attendance: 'going' }, { name: 'Going guest', attendance: 'going' },
      { name: 'Tentative peer', attendance: 'maybe' }, { name: 'Declined peer', attendance: 'declined' }] });
  assert.deepEqual(attendees({ ...meal, organizer: true }), ['Going guest', 'Manual guest', 'Tentative peer']);
  assert.deepEqual(attendees({ ...meal, organizer: false }), ['Going guest']);
  assert.deepEqual(attendees({ ...meal, organizer: true, attending: undefined }), ['Going guest']);
  assert.deepEqual(attendees({ ...meal, organizer: true, selectedTime: '' }), []);
});

test('invitation landing and save notices explain who can see answers', async () => {
  const context = vm.createContext({ escape, inviteError: '', invitationPreview: baseMeal(), dinnerPhotoMarkup: () => '' });
  vm.runInContext(section(mobile, 'function invitationLanding(', '\nasync function loadInvitation('), context);
  const html = context.invitationLanding();
  assert.match(html, /Sign in to see the date and details\./);
  assert.match(html, /Other guests and your host never see your availability. Enkai processes it to find a time and deletes it after the dinner\./);
  assert.match(html, /Only Going is shown to other guests\./);
  assert.doesNotMatch(html, /Open Enkai to view your invitation/);
  const messages = [];
  const saving = vm.createContext({ requestInFlight: false, activeMeal: {}, finalPlan,
    panel: { open: false, querySelectorAll: () => [] }, api: async () => ({ id: 'dinner' }),
    setMealAddress() {}, sessionStorage: { removeItem() {} }, responseDraftKey: 'response', responseReceipt: '',
    refresh: async () => {}, message: text => messages.push(text), credential: 'token' });
  vm.runInContext(section(planner, 'async function syncMeal(', '\nfunction inviteUrl('), saving);
  await saving.syncMeal('rsvp', { id: 'dinner' });
  await saving.syncMeal('vote', { id: 'dinner' });
  assert.deepEqual(messages, ['Your RSVP is saved. Only Going is shown to other guests.',
    "Your response is saved. Other guests and your host never see your availability. Enkai processes it to find a time and deletes it after the dinner."]);
});

test('sharing and crawler metadata ignore legacy scheduling fields', async () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync('invitation-sharing.js', 'utf8'), { window, URL, btoa });
  const meal = baseMeal({ ...legacy, selectedTime: first, restaurant: 'Cedar', times: [first, 'PRIVATE_PEER_TIME'] });
  const text = window.EnkaiInvites.text(meal);
  assert.doesNotMatch(text, /2026|Dec|23:00|PRIVATE_PEER_TIME|vote|date options|time options/i);
  const { invitationResponse } = await import('../preview-service/core.mjs');
  const code = Buffer.from('11111111111141118111111111111111', 'hex').toString('base64url');
  const response = await invitationResponse('https://preview.example/i?code=' + code, 'WhatsApp',
    async (_, options) => Response.json(JSON.parse(options.body).action === 'preview' ? meal : { photo: null }));
  assert.doesNotMatch(await response.text(), /2026|Dec 5|6:00|23:00|PRIVATE_PEER_TIME|vote or RSVP/i);
});

test('public preview allowlist excludes schedule fields and request logging stays minimal', () => {
  const edge = fs.readFileSync('supabase/functions/meal-planner/index.ts', 'utf8');
  const preview = section(edge, '    return reply({ title: d.title', '\n  }');
  assert.doesNotMatch(preview, /selectedTime|timeZone|duration|times|responses/);
  assert.doesNotMatch(edge, /console\.log\s*\(/);
  const logs = edge.match(/console\.[\w]+\([^;]+/g) || [];
  assert.deepEqual(logs, ["console.error('Planner database operation failed', action, error.code)"]);
  const landing = section(mobile, 'function invitationLanding(', '\nasync function loadInvitation(');
  assert.doesNotMatch(landing, /selectedTime|timeZone|duration|host can see/);
});

const agentResult = { status: 'works', proposedTime: '2026-12-07T23:00:00.000Z', computedAt: first, optionsVersion: 'digest' };
const agentMarkup = html => html.match(/<section[^>]*data-agent-card[\s\S]*?<\/section>/)?.[0] || '';
test('injected agent results never reach guest cards or derived state', () => {
  for (const status of ['works', 'none', 'waiting']) {
    const meal = baseMeal({ organizer: false, agentResult: { ...agentResult, status } });
    for (const receipt of [true, false]) {
      const html = renderDinner(meal, receipt);
      assert.doesNotMatch(html, /data-agent-card|A time works|No time works yet|Dec 7|2026-12-07/);
    }
    assert(!('agentResult' in derive(meal)));
    assert(!('agentResult' in derive({ ...meal, organizer: true }, { role: 'guest' })));
  }
});

test('organizer card shows coarse states with only the proposed time and no names or counts', () => {
  const meal = baseMeal({ ...legacy, organizer: true, guests: ['Private peer'], agentResult,
    times: [first, agentResult.proposedTime] });
  for (const status of [undefined, 'waiting', 'works', 'none', 'checking', 'agent_limit', 'error']) {
    const result = { ...agentResult, status, names: ['Private peer'], count: 37, answers: [true, false] };
    const local = ['checking', 'agent_limit', 'error'].includes(status) ? new Map([[meal.id, result]]) : new Map();
    const card = agentMarkup(renderDinner({ ...meal, agentResult: status ? result : undefined }, false, { agentChecks: local }));
    assert(card);
    assert.doesNotMatch(card, /Private peer|computedAt|optionsVersion|answers|rank|count/);
    const formatted = mealDateTime(agentResult.proposedTime, meal);
    assert.doesNotMatch(card.replace(/<[^>]+>/g, '').replace(formatted, ''), /\d/);
    if (status === 'works') {
      assert(card.includes(formatted));
      assert.match(card, /A time works[\s\S]*Approve this time[\s\S]*Check again/);
      assert.doesNotMatch(card, /23:00|2026-12-07/);
    } else assert(!card.includes(formatted));
    if (status === 'none') assert.match(card, /No time works yet\.[\s\S]*You can still choose a time yourself\./);
    if (status === 'waiting') assert.match(card, /Waiting for more guests to join before Enkai can check\./);
    if (status === 'checking') assert.match(card, /data-action="agent-check" disabled/);
    if (status === 'agent_limit') assert.match(card, /Enkai has checked enough for today. Try again tomorrow\./);
    if (status === 'error') assert.match(card, /Couldn't check right now. Try again\./);
  }
  for (const overrides of [{ selectedTime: first }, { cancelled: true }]) {
    assert.equal(agentMarkup(renderDinner({ ...meal, ...overrides })), '');
  }
  assert.doesNotMatch(renderDinner(baseMeal({ organizer: true })), /Host choice/);
});

function agentHarness(overrides = {}) {
  const meal = baseMeal({ organizer: true, version: 7, agentResult, times: [first, agentResult.proposedTime], ...overrides });
  const calls = [], screens = [], messages = [];
  const context = vm.createContext({ activeMeal: meal, state: { meals: [meal] }, credential: 'session',
    requestInFlight: false, agentChecks: new Map(), hostChoices: new Map(), escape, mealDateTime, finalPlan,
    panel: { open: true, querySelectorAll: () => [] }, persistOpenDraft() {}, render() {},
    setMealAddress() {}, sessionStorage: { removeItem() {} }, message: text => messages.push(text),
    mealDetails(current) { context.activeMeal = current; screens.push(current); },
    api: async (action, payload) => {
      calls.push({ action, payload });
      return action === 'list' ? context.state.meals : action === 'agent-check' ? { agentResult } : { id: meal.id };
    },
  });
  vm.runInContext(section(planner, 'function mealPlanDetails(', '\nfunction pollTallies('), context);
  vm.runInContext(section(planner, 'async function refresh(', '\nasync function refreshOnReturn('), context);
  vm.runInContext(section(planner, 'async function syncMeal(', '\nfunction inviteUrl('), context);
  return { context, meal, calls, screens, messages };
}

test('load and list never call agent-check; only the explicit action starts it', async () => {
  const h = agentHarness();
  await h.context.refresh();
  await h.context.refresh(true);
  renderDinner(h.meal);
  assert.deepEqual(h.calls.map(call => call.action), ['list', 'list']);
  assert.equal((planner.match(/api\('agent-check'/g) || []).length, 1);
  assert.equal((planner.match(/checkAgentTime\(/g) || []).length, 2, 'Only declaration and click handler');
  assert.match(planner, /case 'agent-check': checkAgentTime\(\); break;/);
  let complete;
  h.context.api = async (action, payload) => {
    h.calls.push({ action, payload });
    return action === 'agent-check' ? new Promise(resolve => { complete = resolve; }) : [h.meal];
  };
  const running = h.context.checkAgentTime();
  assert.equal(h.context.agentChecks.get(h.meal.id).status, 'checking');
  assert.match(h.context.agentCard(h.meal, derive(h.meal)), /Checking\.\.\.[\s\S]*disabled/);
  await h.context.checkAgentTime();
  assert.equal(h.calls.filter(call => call.action === 'agent-check').length, 1);
  assert.equal(JSON.stringify(h.calls.at(-1).payload), JSON.stringify({ id: h.meal.id }));
  complete({ agentResult }); await running;
  assert.equal(h.calls.at(-1).action, 'list');
  assert(!h.context.agentChecks.has(h.meal.id));
});

test('agent retry states stay neutral, stale re-lists, and guests cannot run checks', async () => {
  for (const failure of ['waiting', 'stale', 'agent_limit', 'provider private error']) {
    const h = agentHarness(); let lists = 0;
    h.context.api = async action => {
      if (action === 'list') { lists++; return [h.meal]; }
      if (failure === 'waiting') return { agentResult: { status: 'waiting' } };
      throw Error(failure);
    };
    await h.context.checkAgentTime();
    const card = h.context.agentCard(h.meal, derive(h.meal));
    assert.doesNotMatch(card, /provider private error|No time works yet/);
    if (failure === 'stale') { assert.equal(lists, 1); assert.match(card, /Enkai can privately check/); }
    else assert.equal(h.context.agentChecks.get(h.meal.id).status,
      failure === 'waiting' ? 'waiting' : failure === 'agent_limit' ? 'agent_limit' : 'error');
  }
  const guest = agentHarness({ organizer: false });
  await guest.context.checkAgentTime(); await guest.context.approveAgentTime();
  assert.deepEqual(guest.calls, []);
});

test('approval revalidates the result and saves only plan details with the current version', async () => {
  const h = agentHarness();
  await h.context.approveAgentTime();
  assert.deepEqual(h.calls.map(call => call.action), ['list', 'manage', 'list']);
  const saved = h.calls.find(call => call.action === 'manage').payload;
  assert.equal(saved.version, 7);
  assert.equal(saved.details.selectedTime, agentResult.proposedTime);
  for (const key of ['agentResult', 'organizer', 'version', 'responses']) assert(!(key in saved.details));
  assert(!h.context.hostChoices.has(h.meal.id));
  const stale = agentHarness();
  stale.context.state.meals = [{ ...stale.meal, version: 8 }];
  await stale.context.approveAgentTime();
  assert.deepEqual(stale.calls.map(call => call.action), ['list']);
  assert(!stale.context.state.meals[0].agentResult);
});

test('manual and cancellation manage saves strip list-only keys and host choice is session-only', async () => {
  for (const cancelled of [false, true]) {
    const h = agentHarness();
    await h.context.syncMeal('manage', { id: h.meal.id, version: 7,
      details: { ...h.meal, selectedTime: first, cancelled, calendarSync: {}, myCalendar: {}, suggested: true } });
    const saved = h.calls.find(call => call.action === 'manage').payload.details;
    for (const key of ['agentResult', 'id', 'version', 'calendarSync', 'myCalendar', 'suggested']) assert(!(key in saved));
    assert(!('hostChoice' in saved));
    const chosen = { ...h.meal, selectedTime: first };
    assert.match(renderDinner(chosen, false, { hostChoices: h.context.hostChoices }), /Host choice/);
    assert.doesNotMatch(renderDinner({ ...chosen, organizer: false }, false, { hostChoices: h.context.hostChoices }), /Host choice/);
    assert.doesNotMatch(renderDinner(chosen), /Host choice/);
  }
});

test('calendar conflict UI ignores even injected event titles', () => {
  const target = { dataset: { calendarTime: first }, innerHTML: '' };
  const context = vm.createContext({ panel: { open: true, querySelector: () => null, querySelectorAll: () => [target] },
    activeMeal: baseMeal(), connectedCalendars: () => [{}], hasConflict: () => false, escape,
    EnkaiTime: { format: value => value }, mealZone: meal => meal.timeZone, calendarNames: { google: 'Google' } });
  vm.runInContext(section(calendar, 'function paintCalendarChecks(', '\nasync function checkDinnerCalendar('), context);
  const conflict = { start: first, end: first, provider: 'google' };
  Object.defineProperty(conflict, 'title', { get() { assert.fail('Never read event titles'); } });
  context.paintCalendarChecks(baseMeal(), { status: 'checked', options: [{ time: first, conflicts: [conflict] }] });
  assert.match(target.innerHTML, /<strong>Busy<\/strong>/);
  assert.match(calendar, /Enkai checks only free\/busy times, never event titles/);
});
