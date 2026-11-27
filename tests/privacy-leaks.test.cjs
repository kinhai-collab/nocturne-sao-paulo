const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { derive } = require('../dinner-state.js');
const { renderDinner, baseMeal, first, section, escape, finalPlan, planner, mobile } = require('./helpers/dinner-render.cjs');

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
      assert.match(html, /Your host and other guests can't see your individual time choices\./);
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
  const context = vm.createContext({ escape, dinnerState: meal => derive(meal, { now: '2026-11-26' }),
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
  assert.match(html, /Your host and other guests can't see your individual time choices\./);
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
    "Your response is saved. Your host and other guests can't see your individual time choices."]);
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
