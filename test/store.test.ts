import { expect, test } from 'bun:test';
import { colorsFrom, DEFAULT_COLORS, importable, rulesFrom } from '../src/shared/store.ts';

test('imports well-formed cards, site rules and colors', () => {
  const data = {
    'card:visa:2071': { brand: 'visa', last4: '2071', alias: 'Revolut', updatedAt: 1 },
    'site:shop.example': [{ brand: 'card', last4: '8123' }],
    settings: { colors: { newColor: '#d97706', knownColor: '#3b82f6' } },
  };
  expect(importable(data)).toEqual(data);
});

test('drops malformed entries and keeps the rest', () => {
  const data = {
    'card:visa:2071': { brand: 'visa', last4: '2071', alias: 'Revolut' },
    'card:bogus:2071': { brand: 'bogus', last4: '2071', alias: 'x' },
    'card:visa:9999': { brand: 'visa', last4: '2071', alias: 'key and digits disagree' },
    'card:visa:1234': { brand: 'visa', last4: '1234', alias: '   ' },
    'site:a.example': [null],
    'site:b.example': [{ brand: 'visa', last4: 'abcd' }],
    settings: { colors: { newColor: 42, knownColor: '#3b82f6' } },
    other: 'ignored',
  };
  expect(Object.keys(importable(data))).toEqual(['card:visa:2071']);
});

test('rejects inherited object keys as brands', () => {
  expect(importable({ 'card:constructor:2071': { brand: 'constructor', last4: '2071', alias: 'x' } })).toEqual({});
});

test('rejects files that are not objects', () => {
  expect(importable(null)).toEqual({});
  expect(importable([1, 2])).toEqual({});
});

test('bad stored colors fall back to the defaults', () => {
  expect(colorsFrom({ settings: { colors: { newColor: 'red', knownColor: '#3b82f6' } } })).toEqual(DEFAULT_COLORS);
});

test('bad stored site rules are skipped', () => {
  expect(rulesFrom({ 'site:x': [null, { brand: 'visa', last4: '2071' }] }, 'x')).toEqual([
    { brand: 'visa', last4: '2071' },
  ]);
});
