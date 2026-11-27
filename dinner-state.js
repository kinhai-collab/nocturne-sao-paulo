/* Shared, side-effect-free dinner state for the UI and future agents. */
(function (root) {
  'use strict';
  const reservationLabels = Object.freeze({
    Unbooked: 'Not reserved yet', Booked: 'Reserved', Confirmed: 'Reservation reconfirmed',
    'In-person booking only': 'Walk-in only',
  });
  function derive(meal, { now = Date.now(), role = meal.organizer ? 'organizer' : 'guest' } = {}) {
    const responses = Array.isArray(meal.responses) ? meal.responses : [];
    const otherResponseCount = Math.max(0, responses.length - Number(role === 'organizer' && Boolean(meal.myVote)));
    const noneCounts = { times: 0, restaurants: 0 };
    const tallies = {};
    for (const key of ['times', 'restaurants']) {
      tallies[key] = [...new Set(meal[key] || [])].map(value => {
        const voters = responses.filter(response => Array.isArray(response.vote?.[key]) && response.vote[key].includes(value));
        return { value, count: voters.length, names: voters.map(response => response.name || 'Guest') };
      });
      // Missing dimensions are not votes. An explicit empty array means none.
      noneCounts[key] = responses.filter(response => Array.isArray(response.vote?.[key]) && response.vote[key].length === 0).length;
    }
    const leaders = key => {
      const top = Math.max(0, ...tallies[key].map(row => row.count));
      return top ? tallies[key].filter(row => row.count === top) : [];
    };
    const timeLeaders = leaders('times'), restaurantLeaders = leaders('restaurants');
    const final = Boolean(meal.selectedTime && meal.restaurant);
    let stage = meal.cancelled ? 'cancelled'
      : meal.selectedTime && Date.parse(meal.selectedTime) + (Number(meal.duration) || 90) * 60000 <= Number(new Date(now)) ? 'past'
      : !meal.selectedTime ? 'choosing-date'
      : !meal.restaurant ? (meal.restaurants?.length ? 'choosing-restaurant' : 'needs-restaurant-options')
      : role === 'guest' && (!meal.myVote?.attendance || meal.myVote.needsReconfirmation) ? 'rsvp-needed'
      : !meal.status || meal.status === 'Unbooked' ? 'reservation-needed' : 'confirmed';
    const statusLabel = ({ cancelled: 'Cancelled', past: 'Past dinner', 'choosing-date': 'Choosing a date',
      'choosing-restaurant': 'Choosing a restaurant', 'needs-restaurant-options': 'Choosing a restaurant',
      'reservation-needed': reservationLabels.Unbooked, 'rsvp-needed': reservationLabels[meal.status || 'Unbooked'],
      confirmed: reservationLabels[meal.status] })[stage] || 'Reserved';
    const action = (id, label, hint = '') => ({ id, label, hint });
    const leadHint = (rows, key) => {
      if (!rows.length) return 'Review the group’s choices.';
      const labels = rows.map(row => {
        if (key === 'times') {
          try { return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: meal.timeZone || 'UTC' }).format(new Date(row.value)); }
          catch { /* Preserve the structured value if an older plan has an invalid zone. */ }
        }
        return row.value;
      });
      const label = new Intl.ListFormat('en', { type: 'conjunction' }).format(labels);
      const total = responses.filter(response => Array.isArray(response.vote?.[key])).length;
      return label + (rows.length > 1 ? ' are tied · ' : ' leads · ') + rows[0].count + ' of ' + total + (key === 'times' ? ' can make it' : rows.length > 1 ? ' picked each' : ' picked it');
    };
    let nextAction = null;
    if (stage !== 'cancelled') {
      if (stage === 'past') nextAction = action('view-plan', 'View plan');
      else if (role === 'guest') {
        if (final) nextAction = action('respond', meal.myVote?.attendance && !meal.myVote.needsReconfirmation ? 'Change my RSVP' : 'RSVP');
        else if (!meal.selectedTime || (!meal.restaurant && meal.restaurants?.length)) nextAction = action('respond', 'Share your availability', 'RSVP opens once the date and restaurant are set.');
        else nextAction = action('view-plan', 'View plan', 'RSVP opens once the date and restaurant are set.');
      } else if (stage === 'needs-restaurant-options') nextAction = action('find-place', 'Find a place');
      else if (stage === 'reservation-needed') nextAction = action('record-reservation', 'Record your reservation');
      else if (stage === 'confirmed' || otherResponseCount === 0) nextAction = action('share-invitation', 'Share invitation');
      else if (stage === 'choosing-date') nextAction = action('pick-date', 'Pick the date', leadHint(timeLeaders, 'times'));
      else nextAction = action('pick-restaurant', 'Pick the restaurant', leadHint(restaurantLeaders, 'restaurants'));
    }
    return { stage, statusLabel, role, nextAction, tallies, otherResponseCount,
      leadingTime: timeLeaders.length === 1 ? timeLeaders[0].value : null,
      leadingRestaurant: restaurantLeaders.length === 1 ? restaurantLeaders[0].value : null,
      tiedTimes: timeLeaders.length > 1 ? timeLeaders.map(row => row.value) : [],
      tiedRestaurants: restaurantLeaders.length > 1 ? restaurantLeaders.map(row => row.value) : [], noneCounts };
  }
  const api = Object.freeze({ derive, reservationLabels });
  root.EnkaiDinnerState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
