const test = require('node:test');
const assert = require('node:assert/strict');
const { shortlist, priceRank } = require('../group-shortlist.js');

const place = (name, priceLevel, rating = 4.5, userRatingCount = 30) => ({
  id: name, displayName: { text: name }, priceLevel, rating, userRatingCount,
});

test('ranks live Google Places candidates and limits to three', () => {
  const input = [
    place('D', 'PRICE_LEVEL_MODERATE', 5, 10),
    place('B', 'PRICE_LEVEL_MODERATE', 4.7, 800),
    place('A', 'PRICE_LEVEL_MODERATE', 4.8, 400),
    place('C', 'PRICE_LEVEL_MODERATE', 4.6, 120),
  ];
  const result = shortlist(input, '');
  assert.equal(result.length, 3);
  assert.equal(result[0].displayName.text, 'B');
});

test('filters explicitly expensive choices without treating unknown price as free', () => {
  const result = shortlist([
    place('Too expensive', 'PRICE_LEVEL_VERY_EXPENSIVE'),
    place('Moderate', 'PRICE_LEVEL_MODERATE', 4.2),
    place('Unknown', undefined, 5),
  ], '2');
  assert.deepEqual(result.map(p => p.displayName.text), ['Moderate', 'Unknown']);
  assert.equal(priceRank(result[1]), null);
});

test('does not manufacture places from missing or malformed API data', () => {
  assert.deepEqual(shortlist(null, '2'), []);
  assert.deepEqual(shortlist([{ id: 'x' }, place('Valid', 'PRICE_LEVEL_INEXPENSIVE')], '2')
    .map(p => p.displayName.text), ['Valid']);
});

test('does not infer seating or availability from price or ratings', () => {
  const result = shortlist([place('One', 'PRICE_LEVEL_MODERATE')], '2');
  assert.equal(Object.hasOwn(result[0], 'availability'), false);
  assert.equal(Object.hasOwn(result[0], 'groupCapacity'), false);
});
