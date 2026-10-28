import { type Cards, type Colors, DEFAULT_COLORS, type SiteRule } from '../shared/store.ts';

/** Marks every element the extension adds, so scans and observers skip them. */
export const UI_ATTR = 'data-card-alias-ui';

export const state: { cards: Cards; siteRules: SiteRule[]; colors: Colors } = {
  cards: {},
  siteRules: [],
  colors: DEFAULT_COLORS,
};
