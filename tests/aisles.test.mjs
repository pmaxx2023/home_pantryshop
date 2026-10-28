import test from 'node:test';
import assert from 'node:assert/strict';
import { guessAisle, AISLES } from '../src/aisles.js';
import { nameKey } from '../src/worker.js';

test('guesses common aisles', () => {
  assert.equal(guessAisle('2% milk'), 'Dairy & Eggs');
  assert.equal(guessAisle('bananas'), 'Produce');
  assert.equal(guessAisle('paper towels'), 'Household');
  assert.equal(guessAisle('chicken thighs'), 'Meat & Seafood');
  assert.equal(guessAisle('frozen peas'), 'Frozen');
  assert.equal(guessAisle('something odd'), 'Other');
  assert.equal(guessAisle('chocolate chips'), 'Pantry');
  assert.equal(guessAisle('birthday candles'), 'Other');
});

test('aisle list ends with Other', () => {
  assert.equal(AISLES.at(-1), 'Other');
});

test('nameKey normalizes', () => {
  assert.equal(nameKey('  Oat  Milk! '), 'oat milk');
  assert.equal(nameKey('Eggs'), nameKey('eggs'));
});
