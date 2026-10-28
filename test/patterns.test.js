const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../src/patterns.js');

const hits = [
  ['Visa Debit •••• 2071', 'visa', '2071'],
  ['Card •••• 5896', 'card', '5896'],
  ['Visa ****2071', 'visa', '2071'],
  ['**** **** **** 2071 Credit card', 'card', '2071'],
  ['XXXX-XXXX-XXXX-2071 Visa', 'visa', '2071'],
  ['Card ending in 2071', 'card', '2071'],
  ['card ending 2071', 'card', '2071'],
  ['Mastercard ending in 2071', 'mastercard', '2071'],
  ['Debit card ends with 2071', 'card', '2071'],
  ['Last 4: 2071 (credit card)', 'card', '2071'],
  ['Pay with card x2071', 'card', '2071'],
  ['Visa x-2071', 'visa', '2071'],
  ['MC-2071', 'mastercard', '2071'],
  ['Visa - 2071', 'visa', '2071'],
  ['Visa | 2071', 'visa', '2071'],
  ['Visa (…2071)', 'visa', '2071'],
  ['Credit card ...2071', 'card', '2071'],
  ['AMEX x12345', 'amex', '12345'],
  ['Device account number •••• 2071', 'card', '2071'],
  ['Tarjeta terminada en 2071', 'card', '2071'],
  ['Tarjeta acabada en 2071', 'card', '2071'],
  ['Tarjeta que acaba en 2071', 'card', '2071'],
  ['Visa finalizada en 2071', 'visa', '2071'],
  ['Tarjeta que termina en 2071', 'card', '2071'],
  ['Visa con terminación 2071', 'visa', '2071'],
  ['Tarjeta, últimos 4 dígitos 2071', 'card', '2071'],
  ['Tarjeta de crédito, dígitos finales 2071', 'card', '2071'],
  ['Nº de tarjeta: **** 2071', 'card', '2071'],
  ['Tarjeta de débito ···· 2071', 'card', '2071'],
  ['Débito ●●●● 2071', 'card', '2071'],
  ['Visa Debit •••• 2071', 'visa', '2071'],
];

for (const [text, brand, suffix] of hits) {
  test(`detects: ${text}`, () => {
    assert.deepEqual(analyze(text), [{ brand, suffix }]);
  });
}

test('brand from image alt counts as context', () => {
  assert.deepEqual(analyze('•••• 2071', 'VISA'), [{ brand: 'visa', suffix: '2071' }]);
});

test('brand from class name or file name', () => {
  assert.deepEqual(analyze('Card •••• 2071', '', 'brand mastercard'), [{ brand: 'mastercard', suffix: '2071' }]);
});

const decoys = [
  'Order #2071',
  'Pedido 2071 enviado',
  '© 2024 Visa Inc.',
  'Visa 2024 annual report',
  'Phone •••• 2071',
  'Teléfono móvil ···· 2071',
  'Código enviado por SMS al ••• 2071',
  'Call +34 •••• 2071',
  'IBAN ES** **** 2071',
  'Total €20.71',
  '•••• 2071',
  'Pending 2071 items',
  'Box 2071',
  'Card •••• 12345',
];

for (const text of decoys) {
  test(`ignores: ${text}`, () => {
    assert.deepEqual(analyze(text), []);
  });
}
