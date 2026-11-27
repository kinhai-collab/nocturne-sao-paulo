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

test('organizer ignores legacy time answers and uses anonymous restaurant totals without mutation', () => {
  const meal = plan({ hasOtherResponses: true, restaurantTallies: [{ value: 'Garden', count: 2, names: ['Ari'] }],
    responses: [{ name: 'Ari', vote: { times: [first], restaurants: ['Garden'] } }] });
  const before = structuredClone(meal);
  const result = derive(meal, context);
  assert.equal(result.stage, 'choosing-date');
  assert.deepEqual(result.nextAction, { id: 'pick-date', label: 'Pick the date', hint: 'Find a time, or choose one yourself.' });
  assert.deepEqual(result.tallies, { restaurants: [{ value: 'Garden', count: 2 }] });
  assert.equal(result.leadingRestaurant, 'Garden');
  for (const key of ['leadingTime', 'tiedTimes', 'noneCounts', 'otherResponseCount']) assert(!(key in result));
  assert.deepEqual(meal, before);
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

test('sharing guidance uses only the projected boolean, never legacy response counts', () => {
  const meal = plan({ myVote: { times: [first] }, responses: [{ name: 'Host' }, { name: 'Ari' }] });
  assert.equal(derive(meal, context).nextAction.id, 'share-invitation');
  assert.equal(derive({ ...meal, hasOtherResponses: true }, context).nextAction.id, 'pick-date');
  assert.equal(derive({ ...meal, responses: undefined }, context).nextAction.id, 'share-invitation');
});

test('restaurant totals come only from the anonymous projection while the poll is open', () => {
  const meal = plan({ selectedTime: first, hasOtherResponses: true,
    restaurantTallies: [{ value: 'Cedar', count: 1 }, { value: 'Garden', count: 1 }] });
  const result = derive(meal, context);
  assert.equal(result.nextAction.id, 'pick-restaurant');
  assert.equal(result.leadingRestaurant, null);
  assert.deepEqual(result.tiedRestaurants, ['Cedar', 'Garden']);
  assert.equal(result.nextAction.hint, 'Review the restaurant choices.');
  assert.deepEqual(derive({ ...meal, restaurant: 'Cedar' }, context).tallies.restaurants, []);
  assert.deepEqual(derive({ ...meal, restaurantTallies: undefined }, context).tallies.restaurants, []);
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
