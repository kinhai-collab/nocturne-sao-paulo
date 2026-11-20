/* Lightweight restaurant ranking for an agreed-time group dinner.
   Google Places price levels are broad categories, not menu quotes.
   This module never claims group availability or reservation confirmation. */
(function (root) {
  'use strict';
  const levels = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  function priceRank(place) {
    return Object.prototype.hasOwnProperty.call(levels, place?.priceLevel)
      ? levels[place.priceLevel] : null;
  }
  function shortlist(places, budget) {
    const limit = /^[1-4]$/.test(String(budget)) ? Number(budget) : null;
    if (!Array.isArray(places)) return [];
    const seenNames = new Set();
    return places
      .filter(place => typeof place?.displayName?.text === 'string' &&
        place.displayName.text.trim().length > 0 &&
        typeof place.id === 'string' && place.id.length > 0)
      .filter(place => limit === null || priceRank(place) === null || priceRank(place) <= limit)
      .sort((a, b) => {
        if (limit !== null) {
          const unknownA = Number(priceRank(a) === null);
          const unknownB = Number(priceRank(b) === null);
          if (unknownA !== unknownB) return unknownA - unknownB;
        }
        const score = place => (Number(place.rating) || 0) *
          Math.log1p(Math.max(0, Number(place.userRatingCount) || 0));
        return score(b) - score(a) || a.displayName.text.localeCompare(b.displayName.text);
      })
      .filter(place => {
        const name = place.displayName.text.trim().toLocaleLowerCase();
        if (seenNames.has(name)) return false;
        seenNames.add(name);
        return true;
      })
      .slice(0, 3);
  }
  const api = Object.freeze({ shortlist, priceRank });
  root.EnkaiGroupPicks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
