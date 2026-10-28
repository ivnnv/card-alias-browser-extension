import { type Brand, LABELS } from './patterns.ts';

export interface Card {
  brand: Brand;
  last4: string;
  alias: string;
  updatedAt: number;
}

export interface SiteRule {
  brand: Brand;
  last4: string;
}

export interface Colors {
  newColor: string;
  knownColor: string;
}

export type Cards = Record<string, Card>;
export type StoredData = Record<string, unknown>;

export const SETTINGS_KEY = 'settings';
export const DEFAULT_COLORS: Colors = { newColor: '#d97706', knownColor: '#3b82f6' };

const area = () => chrome.storage.sync;
export const cardKey = (brand: Brand, last4: string) => `card:${brand}:${last4}`;
export const siteKey = (host: string) => `site:${host}`;

export function cardsFrom(all: StoredData): Cards {
  const cards: Cards = {};
  for (const [key, value] of Object.entries(all)) if (key.startsWith('card:')) cards[key] = value as Card;
  return cards;
}

export function rulesFrom(all: StoredData, host: string): SiteRule[] {
  const rules = all[siteKey(host)];
  return Array.isArray(rules) ? rules.filter(isSiteRule) : [];
}

const isBrand = (v: unknown): v is Brand => typeof v === 'string' && Object.hasOwn(LABELS, v);
const isLast4 = (v: unknown): v is string => typeof v === 'string' && /^\d{4,5}$/.test(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isCard = (v: unknown): v is Card =>
  isRecord(v) && isBrand(v.brand) && isLast4(v.last4) && typeof v.alias === 'string' && v.alias.trim().length > 0;
const isSiteRule = (v: unknown): v is SiteRule => isRecord(v) && isBrand(v.brand) && isLast4(v.last4);
const isColors = (v: unknown): v is Colors => isRecord(v) && isHex(v.newColor) && isHex(v.knownColor);

/** Only the entries of an exported file that are safe to write back to storage. */
export function importable(data: unknown): StoredData {
  if (!isRecord(data)) return {};
  return Object.fromEntries(
    Object.entries(data).filter(([key, v]) => {
      if (key.startsWith('card:')) return isCard(v) && key === cardKey(v.brand, v.last4);
      if (key.startsWith('site:')) return Array.isArray(v) && v.length > 0 && v.every(isSiteRule);
      return key === SETTINGS_KEY && isRecord(v) && isColors(v.colors);
    }),
  );
}

export function colorsFrom(all: StoredData): Colors {
  const saved = (all[SETTINGS_KEY] as { colors?: unknown } | undefined)?.colors;
  return isColors(saved) ? saved : DEFAULT_COLORS;
}

// A generic "card" on either side matches any brand, as long as only one card has those digits.
export function find(cards: Cards, brand: Brand, last4: string): Card | null {
  const exact = cards[cardKey(brand, last4)];
  if (exact) return exact;
  const same = Object.values(cards).filter((c) => c.last4 === last4 && (brand === 'card' || c.brand === 'card'));
  return same.length === 1 ? same[0]! : null;
}

export async function loadAll(): Promise<StoredData> {
  return area().get(null);
}

export async function saveCard(brand: Brand, last4: string, alias: string): Promise<void> {
  const card: Card = { brand, last4, alias, updatedAt: Date.now() };
  await area().set({ [cardKey(brand, last4)]: card });
}

export async function removeCard(brand: Brand, last4: string): Promise<void> {
  await area().remove(cardKey(brand, last4));
}

export async function saveColors(colors: Colors): Promise<void> {
  await area().set({ [SETTINGS_KEY]: { colors } });
}

export async function addSiteRule(host: string, brand: Brand, last4: string): Promise<void> {
  const rules = rulesFrom(await area().get(siteKey(host)), host);
  if (rules.some((r) => r.brand === brand && r.last4 === last4)) return;
  await area().set({ [siteKey(host)]: [...rules, { brand, last4 }] });
}

export async function removeSiteRule(host: string, brand: Brand, last4: string): Promise<void> {
  const rules = rulesFrom(await area().get(siteKey(host)), host);
  const kept = rules.filter((r) => !(r.brand === brand && r.last4 === last4));
  if (kept.length === rules.length) return;
  if (kept.length) await area().set({ [siteKey(host)]: kept });
  else await area().remove(siteKey(host));
}
