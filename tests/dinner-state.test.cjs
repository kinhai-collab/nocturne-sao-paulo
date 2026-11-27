const { test } = require('node:test');
const assert = require('node:assert/strict');
const { derive, reservationLabels } = require('../dinner-state.js');

const first = '2026-12-05T23:00:00.000Z';
const second = '2026-12-06T23:00:00.000Z';
const context = { now: '2026-11-26T12:00:00.000Z', role: 'organizer' };
const plan = overrides => ({
  title: 'Dinner with friends', times: [first, second], restaurants: ['Cedar', 'Garden'],
  selectedTime: '', restaurant: '', status: 'Unbooked', duration: 90,
  timeZone: 'America/Toronto', responses: [], ...overrides,
});

test('organizer poll derives leaders, generic tallies, names and intentional none counts', () => {
  const meal = plan({ responses: [
    { name: 'Ari', vote: { times: [first, second], restaurants: ['Garden'] } },
    { name: 'Sam', vote: { times: [first], restaurants: ['Cedar', 'Garden'] } },
    { name: 'Jo', vote: { times: [], restaurants: [] } },
  ] });
  const before = structuredClone(meal);
  const result = derive(meal, context);
  assert.equal(result.stage, 'choosing-date');
  assert.equal(result.statusLabel, 'Choosing a date');
  assert.equal(result.nextAction.id, 'pick-date');
  assert.equal(result.nextAction.label, 'Pick the date');
  assert.match(result.nextAction.hint, /2 of 3 can make it/);
  assert.equal(result.leadingTime, first);
  assert.equal(result.leadingRestaurant, 'Garden');
  assert.deepEqual(result.tallies.times, [
    { value: first, count: 2, names: ['Ari', 'Sam'] },
    { value: second, count: 1, names: ['Ari'] },
  ]);
  assert.deepEqual(result.tallies.restaurants[1], { value: 'Garden', count: 2, names: ['Ari', 'Sam'] });
  assert.deepEqual(result.noneCounts, { times: 1, restaurants: 1 });
  assert.deepEqual(meal, before, 'derivation must not mutate the meal');
});

test('time agreed without restaurant options asks organizer to Find a place', () => {
  const result = derive(plan({ selectedTime: first, restaurants: [] }), context);
  assert.equal(result.stage, 'needs-restaurant-options');
  assert.deepEqual(result.nextAction, { id: 'find-place', label: 'Find a place', hint: '' });
});

test('final unbooked plan asks organizer to Record your reservation', () => {
  const result = derive(plan({ selectedTime: first, restaurant: 'Cedar' }), context);
  assert.equal(result.stage, 'reservation-needed');
  assert.equal(result.statusLabel, 'Not reserved yet');
  assert.equal(result.nextAction.label, 'Record your reservation');
});

test('guest poll without a vote asks to Share your availability', () => {
  const result = derive(plan({ organizer: true }), { ...context, role: 'guest' });
  assert.equal(result.role, 'guest', 'explicit role overrides the legacy organizer field');
  assert.equal(result.nextAction.label, 'Share your availability');
  assert.equal(result.nextAction.hint, 'RSVP opens once the date and restaurant are set.');
});

test('guest final plan offers RSVP, then Change my RSVP, and reconfirmation offers RSVP', () => {
  const meal = plan({ selectedTime: first, restaurant: 'Cedar', status: 'Booked' });
  const guest = { ...context, role: 'guest' };
  assert.equal(derive(meal, guest).stage, 'rsvp-needed');
  assert.equal(derive(meal, guest).nextAction.label, 'RSVP');
  const unbooked = derive({ ...meal, status: 'Unbooked' }, guest);
  assert.equal(unbooked.nextAction.label, 'RSVP');
  assert.equal(unbooked.stage, 'rsvp-needed');
  assert.equal(unbooked.statusLabel, 'Not reserved yet');
  assert.equal(derive({ ...meal, myVote: { attendance: 'declined' } }, guest).nextAction.label, 'Change my RSVP');
  assert.equal(derive({ ...meal, myVote: { attendance: 'going', needsReconfirmation: true } }, guest).nextAction.label, 'RSVP');
  assert.equal(derive({ ...meal, status: 'Unbooked', myVote: { attendance: 'going', needsReconfirmation: true } }, guest).stage, 'rsvp-needed');
});

test('cancelled dinner has no next action and says Cancelled for either role', () => {
  for (const role of ['organizer', 'guest']) {
    const result = derive(plan({ cancelled: true, selectedTime: first, restaurant: 'Cedar' }), { ...context, role });
    assert.equal(result.stage, 'cancelled');
    assert.equal(result.statusLabel, 'Cancelled');
    assert.equal(result.nextAction, null);
  }
});

test('no responses offers Share invitation; zero votes have no manufactured leader', () => {
  const result = derive(plan(), context);
  assert.equal(result.nextAction.label, 'Share invitation');
  assert.equal(result.leadingTime, null);
  assert.equal(result.leadingRestaurant, null);
  assert.deepEqual(result.noneCounts, { times: 0, restaurants: 0 });
  assert.equal(result.otherResponseCount, 0);
  assert.deepEqual(result.tiedTimes, []);
  assert.deepEqual(result.tiedRestaurants, []);
});

test('host-only availability still asks to Share invitation while keeping the host in tallies', () => {
  const vote = { times: [first], restaurants: ['Cedar'] };
  const meal = plan({ myVote: vote, responses: [{ name: 'Host', vote }] });
  const hostOnly = derive(meal, context);
  assert.equal(hostOnly.otherResponseCount, 0);
  assert.equal(hostOnly.nextAction.id, 'share-invitation');
  assert.equal(hostOnly.tallies.times[0].count, 1);
  assert.equal(hostOnly.leadingTime, first);
  const withGuest = derive({ ...meal, responses: [...meal.responses, { name: 'Ari', vote }] }, context);
  assert.equal(withGuest.otherResponseCount, 1);
  assert.equal(withGuest.nextAction.id, 'pick-date');
  assert.equal(derive(meal, { ...context, role: 'guest' }).otherResponseCount, 1);
});

test('restaurant ties expose all tied values without preselecting a restaurant', () => {
  const result = derive(plan({ selectedTime: first, responses: [
    { name: 'Ari', vote: { restaurants: ['Garden', 'Cedar'] } },
    { name: 'No vote yet' },
  ] }), context);
  assert.equal(result.stage, 'choosing-restaurant');
  assert.equal(result.nextAction.label, 'Pick the restaurant');
  assert.equal(result.leadingRestaurant, null);
  assert.deepEqual(result.tiedRestaurants, ['Cedar', 'Garden']);
  assert.match(result.nextAction.hint, /Cedar and Garden are tied · 1 of 1 picked each/);
  assert.deepEqual(result.noneCounts, { times: 0, restaurants: 0 });
});

test('date ties name the dates and counts without preselecting, and resolve with another vote', () => {
  const meal = plan({ responses: [
    { name: 'Ari', vote: { times: [first, second] } },
    { name: 'Sam', vote: { times: [first, second] } },
    { name: 'Jo', vote: { times: [] } },
  ] });
  const result = derive(meal, context);
  assert.equal(result.leadingTime, null);
  assert.deepEqual(result.tiedTimes, [first, second]);
  assert.equal(result.nextAction.hint, 'Sat, Dec 5 and Sun, Dec 6 are tied · 2 of 3 can make it');
  const resolved = derive({ ...meal, responses: [...meal.responses, { name: 'Kit', vote: { times: [second] } }] }, context);
  assert.equal(resolved.leadingTime, second);
  assert.deepEqual(resolved.tiedTimes, []);
});

test('past dinner uses supplied now and duration, with cancellation taking precedence', () => {
  const meal = plan({ selectedTime: first, restaurant: 'Cedar', status: 'Booked' });
  const after = { ...context, now: '2026-12-06T01:00:00.000Z' };
  assert.equal(derive(meal, after).stage, 'past');
  assert.equal(derive(meal, after).nextAction.label, 'View plan');
  assert.equal(derive({ ...meal, cancelled: true }, after).stage, 'cancelled');
});

test('stored reservation values map to consistent display labels', () => {
  for (const [status, label] of Object.entries(reservationLabels)) {
    assert.equal(derive(plan({ selectedTime: first, restaurant: 'Cedar', status }), context).statusLabel, label);
  }
});
