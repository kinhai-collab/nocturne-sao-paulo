const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dinnerState = require('../dinner-state.js');

const planner = fs.readFileSync('planner.js', 'utf8');
const mobile = fs.readFileSync('planner-mobile.js', 'utf8');
const calendar = fs.readFileSync('planner-calendar.js', 'utf8');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, 'Expected source section: ' + start);
  return source.slice(from, to);
};
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const finalPlan = meal => Boolean(meal.selectedTime && meal.restaurant);
const first = '2026-12-05T23:00:00.000Z';
const baseMeal = overrides => ({ id: 'dinner', title: 'Dinner', location: 'Toronto', hostName: 'Chloe',
  timeZone: 'America/Toronto', times: [first], restaurants: ['Cedar'], guests: [], attending: [], responses: [],
  duration: 90, status: 'Unbooked', ...overrides });

function renderDinner(meal, receipt = false) {
  let html;
  const context = vm.createContext({ escape, finalPlan, EnkaiDinnerState: dinnerState,
    dinnerState: meal => dinnerState.derive(meal, { now: '2026-11-26T12:00:00Z' }),
    activeMeal: null, responseReceipt: receipt ? meal.id : '',
    panel: { querySelector: () => null }, show: (_, body) => { html = body; },
    setMealAddress() {}, restoreResponseDraft() {}, checkDinnerCalendar() {}, loadDinnerPhoto() {},
    dinnerPhotoMarkup: () => '', mealDateTime: value => value, durationLabel: () => '90 minutes',
    destinationLabel: () => 'Toronto time', localTimeNote: () => '', statusPill: escape,
    venueMaps: () => '#', invitationMessage: () => 'Invitation', attendingGuests: () => [],
    isPolling: meal => !finalPlan(meal), timeZoneSelector: () => '', restaurantPicker: () => '', timeInput: () => '',
    attendanceLabels: { going: 'Going', maybe: 'Maybe', declined: 'Can’t make it' }, statuses: ['Unbooked'],
    connectedCalendars: () => [], calendarPollChoices: () => '<input name="times">',
  });
  vm.runInContext(section(mobile, 'function noneChoice(', '\nfunction wizardGuests('), context);
  vm.runInContext(section(calendar, 'function calendarDinnerMarkup(', '\nfunction paintCalendarChecks('), context);
  vm.runInContext(section(planner, 'function pollTallies(', '\nfunction peopleForm('), context);
  context.mealDetails(meal);
  return html;
}
const primaryCount = html => (html.match(/class="[^"]*\bprimary\b[^"]*"/g) || []).length;

test('guest poll and RSVP forms own the single primary action and show a non-button prompt', () => {
  for (const meal of [baseMeal(), baseMeal({ selectedTime: first, restaurant: 'Cedar' })]) {
    const html = renderDinner(meal);
    assert.equal(primaryCount(html), 1);
    assert.match(html, /class="sticky-actions"><button class="primary" type="submit">Save/);
    assert.doesNotMatch(html, /data-action="dinner-next"/);
    assert.match(html, /Your turn:/);
    if (finalPlan(meal)) assert.match(html, /let Chloe know if you’re coming/);
  }
});

test('receipts offer one Change my response action, which disappears when editing', () => {
  for (const meal of [baseMeal({ myVote: { times: [first], restaurants: ['Cedar'] } }),
    baseMeal({ selectedTime: first, restaurant: 'Cedar', myVote: { attendance: 'going' } })]) {
    const receipt = renderDinner(meal, true);
    assert.equal(primaryCount(receipt), 1);
    assert.match(receipt, /data-action="dinner-next">Change my response/);
    assert.doesNotMatch(receipt, /data-action="edit-response"|data-form="respond"/);
    const editing = renderDinner(meal);
    assert.equal(primaryCount(editing), 1);
    assert.match(editing, /data-form="respond"/);
    assert.doesNotMatch(editing, /data-action="dinner-next"/);
  }
});

test('organizer own availability and Save plan are secondary; sharing has no duplicate', () => {
  const vote = { times: [first], restaurants: ['Cedar'] };
  for (const responses of [[], [{ name: 'Ari', vote }]]) {
    const html = renderDinner(baseMeal({ organizer: true, responses }));
    assert.equal(primaryCount(html), 1, 'Also holds with organizer details expanded');
    assert.match(html, /<button type="submit">Save availability/);
    assert.match(html, /<button type="submit">Save plan/);
    assert.doesNotMatch(html, /sticky-actions/);
    if (!responses.length) {
      assert.match(html, /data-action="dinner-next">Share invitation/);
      assert.doesNotMatch(html, /data-action="share"/);
      assert.match(html, /data-action="copy-invite"/);
      assert.match(html, />WhatsApp</);
    } else assert.match(html, /data-action="dinner-next">Pick the date/);
  }
  const cancelled = renderDinner(baseMeal({ organizer: true, cancelled: true }));
  assert.equal(primaryCount(cancelled), 0);
  assert.doesNotMatch(cancelled, /data-form="respond"|data-action="share"/);
});

test('post-render guard retains only the primary that owns the next step', () => {
  const button = () => ({ primary: true, classList: { remove(name) { assert.equal(name, 'primary'); this.owner.primary = false; } } });
  for (const responseOpen of [true, false]) {
    const top = button(), submit = button(), extra = button();
    for (const node of [top, submit, extra]) node.classList.owner = node;
    const detail = { querySelector: selector => selector.includes('guest-response') ? responseOpen ? submit : null : top,
      querySelectorAll: () => [top, submit, extra] };
    const context = vm.createContext({ panel: { querySelector: () => detail } });
    vm.runInContext(section(planner, 'function guardDinnerPrimaryAction(', '\nfunction mealDetails('), context);
    context.guardDinnerPrimaryAction({ nextAction: { id: 'respond' } });
    assert.equal(top.primary, !responseOpen);
    assert.equal(submit.primary, responseOpen);
    assert.equal(extra.primary, false);
  }
});

test('wizard keeps each original step structure and marks the current named step', () => {
  for (const [flow, expected] of [['restaurant', ['Where', 'When', 'Who', 'Review']],
    ['date', ['Where & when', 'Place', 'Who', 'Review']], ['undecided', ['Where & when', 'Who', 'Review']]]) {
    let html, steps;
    const progress = {}, next = {}, create = {};
    const form = { querySelectorAll: () => steps,
      querySelector: selector => ({ '[data-step-progress]': progress, '[data-action=plan-next]': next, '[data-create-plan]': create })[selector] };
    const context = vm.createContext({ escape, wizardStep: 0, activeWish: null, activeMeal: null, state: { people: [] },
      panel: { querySelector: () => form }, durations: [90], durationLabel: () => '90 minutes',
      EnkaiTime: { guessZone: () => '' }, timeZoneSelector: () => '<select name="timeZone"></select>',
      timeInput: () => '<input name="time">', restaurantPicker: () => '<textarea name="restaurants"></textarea>',
      readPlanDraft: () => null, updateTimeInputs() {}, updateSelectedRestaurants() {}, persistOpenDraft() {},
      show(_, body) { html = body; steps = [...body.matchAll(/data-step-name="([^"]+)"/g)].map(match => ({ dataset: { stepName: match[1] } })); },
    });
    vm.runInContext(section(mobile, 'function wizardGuests(', '\nfunction validatePlanStep('), context);
    context.openPlan(null, flow);
    assert.deepEqual(steps.map(step => step.dataset.stepName), expected);
    const firstSection = html.split('</section>')[0];
    assert.match(firstSection, /name="location"/);
    assert.match(firstSection, flow === 'restaurant' ? /name="restaurants"/ : /name="time"/);
    assert.match(progress.innerHTML, /aria-current="step"/);
    context.wizardStep = 1;
    context.renderWizard();
    assert.match(progress.innerHTML, new RegExp('aria-current="step">' + escape(expected[1])));
    assert.equal((progress.innerHTML.match(/aria-current=/g) || []).length, 1);
  }
});

test('city and restaurant-city autofill respect manual time zones until the select is cleared', () => {
  let onChange;
  const city = { value: 'Toronto' }, setting = {};
  const zone = { value: '', dataset: {}, options: [{ value: 'America/Toronto' }, { value: 'Asia/Tokyo' }],
    closest: () => setting, matches: selector => selector === '[name=timeZone]' };
  const form = { querySelector: selector => selector === '[name=location]' ? city : zone };
  zone.form = form;
  const context = vm.createContext({ panel: { addEventListener: (_, callback) => { onChange = callback; } },
    EnkaiTime: { guessZone: city => city === 'Toronto' ? 'America/Toronto' : '' },
    updateTimeInputs() {}, persistOpenDraft() {}, zoneName: value => value,
  });
  vm.runInContext(section(planner, 'function autofillTimeZone(', '\nfunction updateTimeInputs('), context);
  vm.runInContext(section(planner, "panel.addEventListener('change',event=>{", "\ndocument.addEventListener('click'"), context);
  context.autofillTimeZone(form);
  assert.equal(zone.value, 'America/Toronto');
  zone.value = 'Asia/Tokyo';
  onChange({ target: zone });
  assert.equal(zone.dataset.manual, 'true');
  for (const value of ['Unknown city', 'Toronto']) {
    city.value = value;
    context.autofillTimeZone(form);
    assert.equal(zone.value, 'Asia/Tokyo');
  }
  zone.value = '';
  onChange({ target: zone });
  assert.equal(zone.dataset.manual, 'false');
  context.autofillTimeZone(form);
  assert.equal(zone.value, 'America/Toronto');
});

test('only the saving trigger gets a busy label; other submits disable and all restore on failure or success', async () => {
  const button = text => ({ textContent: text, disabled: false, attrs: {},
    getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; } });
  for (const fail of [false, true]) {
    const trigger = button('Save availability'), other = button('Save plan'), disabled = button('Unavailable');
    disabled.disabled = true;
    let resolve, reject;
    const pending = new Promise((ok, error) => { resolve = ok; reject = error; });
    const context = vm.createContext({ requestInFlight: false, activeMeal: {}, finalPlan,
      panel: { open: false, querySelectorAll: () => [trigger, other, disabled] }, api: () => pending,
      setMealAddress() {}, sessionStorage: { removeItem() {} }, responseDraftKey: 'response',
      responseReceipt: '', refresh: async () => {}, message() {}, credential: 'token',
    });
    vm.runInContext(section(planner, 'async function syncMeal(', '\nfunction inviteUrl('), context);
    const saving = context.syncMeal('respond', { id: 'dinner' }, [], trigger);
    assert.equal(trigger.textContent, 'Saving availability…');
    assert.equal(trigger.getAttribute('aria-busy'), 'true');
    assert.equal(other.textContent, 'Save plan');
    assert.equal(other.getAttribute('aria-busy'), null);
    assert([trigger, other, disabled].every(button => button.disabled));
    if (fail) reject(Error('Offline')); else resolve({ id: 'dinner' });
    await saving;
    assert.equal(trigger.textContent, 'Save availability');
    assert.equal(trigger.getAttribute('aria-busy'), null);
    assert.equal(other.textContent, 'Save plan');
    assert.equal(trigger.disabled, false);
    assert.equal(other.disabled, false);
    assert.equal(disabled.disabled, true);
    assert.equal(context.requestInFlight, false);
  }
});
