export type Brand = 'visa' | 'mastercard' | 'maestro' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'card';

export interface Match {
  suffix: string;
  brand: Brand;
}

export interface Span {
  start: number;
  end: number;
}

export const LABELS: Record<Brand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  maestro: 'Maestro',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  card: 'Card',
};

const BRANDS: [Brand, RegExp][] = [
  ['amex', /\b(?:amex|american\s+express)\b/i],
  ['mastercard', /\bmaster\s?card\b/i],
  ['mastercard', /\bMC\b/],
  ['maestro', /\bmaestro\b/i],
  ['visa', /\bvisa\b/i],
  ['discover', /\bdiscover\b/i],
  ['diners', /\bdiners\b/i],
  ['jcb', /\bjcb\b/i],
  ['unionpay', /\bunion\s?pay\b/i],
];

const BRAND_ALT = String.raw`visa|master\s?card|MC|amex|american\s+express|maestro|discover|diners(?:\s+club)?|jcb|union\s?pay`;
const TYPE_ALT = String.raw`debit|credit|prepaid|d[eé]bito|cr[eé]dito|prepago`;
const GAP = String.raw`[\s    ​⁠﻿:\-–—|()]*`;
const MASK_CHAR = String.raw`[•·∙●◦⋅∗*xX#]`;
const MASK_TOKEN = String.raw`(?:${MASK_CHAR}|…|\.{2,})`;
const SUFFIX = String.raw`(?<suffix>\d{4,5})(?!\d)`;
const START = String.raw`(?<![\p{L}\p{N}])`;

const PHRASES = [
  String.raw`ending(?:\s+(?:in|with))?`,
  String.raw`ends\s+(?:in|with)`,
  String.raw`last\s+(?:four|4|five|5)(?:\s+digits)?`,
  String.raw`(?:terminad|acabad|finalizad)[ao]s?\s+en`,
  String.raw`(?:que\s+)?(?:termina|acaba|finaliza)\s+en`,
  String.raw`(?:con\s+)?terminaci[oó]n(?:\s+en)?`,
  String.raw`[uú]ltimos?\s+(?:cuatro|4|cinco|5)\s+d[ií]gitos`,
  String.raw`d[ií]gitos\s+finales`,
].join('|');

// Two or more mask chars, or a single ellipsis / x prefix ("…2071", "x2071").
const MASKED = new RegExp(String.raw`${START}(?:(?:${MASK_CHAR}${GAP}){2,}|(?:…|\.{2,}|[xX])${GAP})${SUFFIX}`, 'gu');
const ENDING = new RegExp(String.raw`${START}(?:${PHRASES})${GAP}(?:${MASK_TOKEN}${GAP})*${SUFFIX}`, 'giu');
// Brand needs a mask or a separator before the digits, so "Visa 2024" stays out.
const BRANDED = new RegExp(
  String.raw`${START}(?<brand>${BRAND_ALT})${GAP}(?:(?:${TYPE_ALT})${GAP})?(?:(?:${MASK_TOKEN}${GAP})+|(?<=[\-–—|:(]\s*))${SUFFIX}`,
  'giu',
);

// Wider than detection: also takes a leading brand ("Visa 6610", "Mastercard ending in 7788")
// so the highlight covers the whole phrase once a row is already known to hold a card.
const PREFIX = String.raw`(?:(?:${BRAND_ALT})${GAP}(?:(?:${TYPE_ALT})${GAP})?)?(?:(?:cards?|tarjeta)${GAP})?`;
const LOCATE = new RegExp(
  String.raw`${START}${PREFIX}(?:(?:${PHRASES})${GAP})?(?:${MASK_TOKEN}${GAP})*${SUFFIX}`,
  'giu',
);

const CARD_CONTEXT =
  /\b(?:cards?|debit|credit|prepaid|payment|pay|wallet|billing|tarjetas?|d[eé]bito|cr[eé]dito|prepago|pago|monedero|device\s+account)\b/i;
const EXCLUDE = /\b(?:phone|tel[eé]fono|m[oó]vil|mobile|sms|whatsapp|iban|swift|bic)\b|\+\d{1,3}[\s-]?\d/i;

export function normalize(text: string): string {
  return text.replace(/[\s    ]+/g, ' ').trim();
}

export function brandOf(text: string): Brand | null {
  for (const [brand, re] of BRANDS) if (re.test(text)) return brand;
  return null;
}

export function detect(text: string): Match[] {
  const out = new Map<string, Match>();
  const add = (suffix: string, brand: Brand) => {
    const prev = out.get(suffix);
    if (!prev || (prev.brand === 'card' && brand !== 'card')) out.set(suffix, { suffix, brand });
  };
  for (const m of text.matchAll(BRANDED)) add(m.groups!.suffix!, brandOf(m.groups!.brand!) ?? 'card');
  for (const m of text.matchAll(ENDING)) add(m.groups!.suffix!, 'card');
  for (const m of text.matchAll(MASKED)) add(m.groups!.suffix!, 'card');
  return [...out.values()];
}

/**
 * Card numbers in one payment row. `labels` is aria-label / alt / title text,
 * `brandHints` is class names and image file names (brand only, never context).
 */
export function analyze(rowText: string, labels = '', brandHints = '', { requireContext = true } = {}): Match[] {
  const text = normalize(`${rowText} ${labels}`);
  const brand = brandOf(text) ?? brandOf(brandHints);
  if (requireContext) {
    if (EXCLUDE.test(text) && !brand) return [];
    if (!brand && !CARD_CONTEXT.test(text)) return [];
  }
  return detect(text)
    .map((m) => ({ suffix: m.suffix, brand: m.brand !== 'card' ? m.brand : (brand ?? 'card') }))
    .filter((m) => m.suffix.length === 4 || m.brand === 'amex');
}

/** Character spans of the full card phrase ending in `suffix`, for highlighting. */
export function locate(text: string, suffix: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(LOCATE)) {
    if (m.groups!.suffix === suffix) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}
