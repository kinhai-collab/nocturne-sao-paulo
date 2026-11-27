const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const dinnerState = require('../../dinner-state.js');

const planner = fs.readFileSync('planner.js', 'utf8');
const mobile = fs.readFileSync('planner-mobile.js', 'utf8');
const calendar = fs.readFileSync('planner-calendar.js', 'utf8');
const timeContext = { window: {}, Intl, Date };
vm.runInNewContext(fs.readFileSync('meal-time.js', 'utf8'), timeContext);
const mealDateTime = (value, meal) => timeContext.window.EnkaiTime.format(value, meal.timeZone);
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

function renderDinner(meal, receipt = false, options = {}) {
  let html;
  const context = vm.createContext({ escape, finalPlan, EnkaiDinnerState: dinnerState,
    dinnerState: meal => dinnerState.derive(meal, { now: '2026-11-26T12:00:00Z' }),
    agentChecks: options.agentChecks || new Map(), hostChoices: options.hostChoices || new Map(),
    activeMeal: null, responseReceipt: receipt ? meal.id : '',
    panel: { querySelector: () => null }, show: (_, body) => { html = body; },
    setMealAddress() {}, restoreResponseDraft() {}, checkDinnerCalendar() {}, loadDinnerPhoto() {},
    dinnerPhotoMarkup: () => '', mealDateTime, durationLabel: () => '90 minutes',
    destinationLabel: () => 'Toronto time', localTimeNote: () => '', statusPill: escape,
    venueMaps: () => '#', invitationMessage: () => 'Invitation', attendingGuests: () => [],
    isPolling: meal => !finalPlan(meal), timeZoneSelector: () => '', restaurantPicker: () => '', timeInput: () => '',
    attendanceLabels: { going: 'Going', maybe: 'Maybe', declined: 'Can’t make it' }, statuses: ['Unbooked'],
    connectedCalendars: () => [], hasConflict: () => false,
  });
  vm.runInContext(section(mobile, 'function noneChoice(', '\nfunction wizardGuests('), context);
  vm.runInContext(section(calendar, 'function calendarPollChoices(', '\nfunction paintCalendarChecks('), context);
  vm.runInContext(section(planner, 'function mealPlanDetails(', '\nfunction peopleForm('), context);
  context.mealDetails(meal);
  return html;
}
module.exports = { renderDinner, baseMeal, first, section, escape, finalPlan, mealDateTime, planner, mobile, calendar };
