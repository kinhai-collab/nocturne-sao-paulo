'use strict';
/* Lightweight group-finder screen, using the existing authenticated Places API.
   Discovery is not a reservation or a confirmation of group seating. */
let groupFinderState = null;

function openGroupFinder() {
  const meal = activeMeal;
  if (!meal?.organizer || !meal.selectedTime || meal.restaurant || meal.cancelled || meal.restaurants?.length) return;
  groupFinderState = { mealId: meal.id, places: [] };
  show('Find a place', '<div class="stack group-finder">' +
    '<p class="muted">Your time is set: <strong>' + escape(mealDateTime(meal.selectedTime, meal)) +
    '</strong>. Find three possible places.</p>' +
    '<form class="stack" data-form="group-search">' +
      '<label>Where?<input name="city" maxlength="120" required value="' + escape(meal.location) + '" placeholder="City or neighbourhood"></label>' +
      '<label>Price range <select name="budget">' +
        '<option value="" selected>Any</option><option value="1">$ · Inexpensive</option>' +
        '<option value="2">$$ · Moderate</option><option value="3">$$$ · Higher</option>' +
        '<option value="4">$$$$ · Very high</option></select></label>' +
      '<details><summary>Have a cuisine in mind?</summary>' +
        '<label>Food type <input name="food" maxlength="100" placeholder="Optional, e.g. Italian"></label></details>' +
      '<button class="primary" type="submit">Find three places</button>' +
    '</form>' +
    '<p class="muted" data-group-status role="status">No restaurant search has been run yet.</p>' +
    '<div class="stack" data-group-results></div>' +
    '<a data-group-google-maps href="' + escape(maps('restaurants',meal.location)) + '" target="_blank" rel="noopener noreferrer">Browse Google Maps instead ↗</a>' +
    '<small>Restaurant suggestions are not checked for group seating or booking availability. Price bands are broad estimates, not quotes.</small></div>');
}

async function searchGroupPlaces(form) {
  const search = groupFinderState;
  if (!search) return;
  const city = form.elements.city.value.trim();
  const food = form.elements.food.value.trim();
  const budget = form.elements.budget.value;
  const status = panel.querySelector('[data-group-status]');
  const output = panel.querySelector('[data-group-results]');
  const button = form.querySelector('[type=submit]');
  if (!city || button.disabled) return;
  button.disabled = true;
  search.places = [];
  output.replaceChildren();
  status.textContent = 'Looking for restaurants…';
  panel.querySelector('[data-group-google-maps]').href = maps(food || 'restaurants', city);
  try {
    const places = await api('places', { city, food });
    if (search !== groupFinderState || !panel.open) return;
    search.places = window.EnkaiGroupPicks.shortlist(places, budget);
    if (!search.places.length) {
      status.textContent = 'No matching options found. Try a different price range or area.';
      return;
    }
    const prices = {
      PRICE_LEVEL_FREE: 'Free',
      PRICE_LEVEL_INEXPENSIVE: '$',
      PRICE_LEVEL_MODERATE: '$$',
      PRICE_LEVEL_EXPENSIVE: '$$$',
      PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
    };
    output.innerHTML = search.places.map((place, index) => {
      const name = place.displayName.text;
      const info = [
        prices[place.priceLevel] || 'Price unknown',
        place.rating ? '★ ' + Number(place.rating).toFixed(1) : '',
        place.userRatingCount ? Number(place.userRatingCount).toLocaleString() + ' reviews' : '',
      ].filter(Boolean).join(' · ');
      return '<article class="card group-result">' +
        '<div class="row spread"><h3>' + escape(name) + '</h3><small>' + escape(info) + '</small></div>' +
        '<p>' + escape(place.formattedAddress || city) + '</p>' +
        '<small>Group seating and availability not verified</small>' +
        '<div class="row"><button type="button" class="primary" data-action="group-pick" data-index="' +
          index + '">Choose this restaurant</button>' +
          '<a href="' + escape(maps(name, place.formattedAddress || city)) +
          '" target="_blank" rel="noopener noreferrer">Details &amp; contact ↗</a></div></article>';
    }).join('') +
      '<button type="button" data-action="group-vote">Ask the group</button>' +
      '<small>Choosing a place does not book a table. A group vote does not hold a reservation.</small>';
    status.textContent = 'Three recommended options, or fewer if not enough matched.';
  } catch (error) {
    if (search === groupFinderState && panel.open) status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function saveGroupShortlist(mode, index, trigger = null) {
  const search = groupFinderState;
  const meal = state.meals.find(item => item.id === search?.mealId);
  if (!meal?.organizer || !meal.selectedTime || meal.restaurant || meal.cancelled || meal.restaurants?.length ||
      !search?.places.length || requestInFlight) return;
  const chosen = mode === 'vote' ? search.places : [search.places[Number(index)]];
  if (!chosen.length || chosen.some(place => !place)) return;
  const names = chosen.map(place => place.displayName.text);
  const confirmation = mode === 'vote'
    ? 'Ask the group about these restaurant options? No tables will be held.'
    : 'Choose ' + names[0] + ' for this dinner? This may notify guests. You still need to contact the restaurant to book.';
  if (!window.confirm(confirmation)) return;
  const details = {
    ...meal,
    restaurants: names,
    restaurant: mode === 'vote' ? '' : names[0],
    status: 'Unbooked',
    venues: chosen.map(place => ({ name: place.displayName.text, placeId: place.id })),
  };
  for (const key of ['id','version','invite','myVote','responses','organizer','joinedCount',
    'attendanceResponses','calendarSync','myCalendar']) delete details[key];
  groupFinderState = null;
  syncMeal('manage', { id: meal.id, version: meal.version, details }, [], trigger);
}
panel.addEventListener('close', () => { groupFinderState = null; });
