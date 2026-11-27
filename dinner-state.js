/* Shared, side-effect-free dinner state for the UI and future agents. */
(function (root) {
  'use strict';
  const reservationLabels = Object.freeze({
    Unbooked: 'Not reserved yet', Booked: 'Reserved', Confirmed: 'Reservation reconfirmed',
    'In-person booking only': 'Walk-in only',
  });
  function derive(meal, { now = Date.now(), role = meal.organizer ? 'organizer' : 'guest' } = {}) {
    // Legacy responses are deliberately ignored, even when present in a cache.
    const hasOtherResponses = meal.hasOtherResponses === true;
    const tallies = { restaurants: !meal.restaurant && !meal.cancelled && Array.isArray(meal.restaurantTallies)
      ? meal.restaurantTallies.map(row => ({ value: row.value, count: row.count })) : [] };
    const top = Math.max(0, ...tallies.restaurants.map(row => row.count));
    const restaurantLeaders = top ? tallies.restaurants.filter(row => row.count === top) : [];
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
    let nextAction = null;
    if (stage !== 'cancelled') {
      if (stage === 'past') nextAction = action('view-plan', 'View plan');
      else if (role === 'guest') {
        if (final) nextAction = action('respond', meal.myVote?.attendance && !meal.myVote.needsReconfirmation ? 'Change my RSVP' : 'RSVP');
        else if (!meal.selectedTime || (!meal.restaurant && meal.restaurants?.length)) nextAction = action('respond', 'Share your availability', 'RSVP opens once the date and restaurant are set.');
        else nextAction = action('view-plan', 'View plan', 'RSVP opens once the date and restaurant are set.');
      } else if (stage === 'needs-restaurant-options') nextAction = action('find-place', 'Find a place');
      else if (stage === 'reservation-needed') nextAction = action('record-reservation', 'Record your reservation');
      else if (stage === 'confirmed' || !hasOtherResponses) nextAction = action('share-invitation', 'Share invitation');
      else if (stage === 'choosing-date') nextAction = action('pick-date', 'Pick the date', 'Find a time, or choose one yourself.');
      else nextAction = action('pick-restaurant', 'Pick the restaurant', 'Review the restaurant choices.');
    }
    return { stage, statusLabel, role, nextAction, tallies, hasOtherResponses,
      ...(role === 'organizer' && meal.agentResult ? { agentResult: meal.agentResult } : {}),
      leadingRestaurant: restaurantLeaders.length === 1 ? restaurantLeaders[0].value : null,
      tiedRestaurants: restaurantLeaders.length > 1 ? restaurantLeaders.map(row => row.value) : [] };
  }
  const api = Object.freeze({ derive, reservationLabels });
  root.EnkaiDinnerState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
