import { cardsFrom, colorsFrom, loadAll, rulesFrom } from '../shared/store.ts';
import { paintAllBadges } from './badges.ts';
import { paintDialog } from './dialog.ts';
import { applyHighlightColors } from './highlights.ts';
import { state } from './state.ts';

/** Reloads cards, this site's rules and colors from storage, and repaints with the new colors. */
export async function refresh(): Promise<void> {
  const all = await loadAll();
  state.cards = cardsFrom(all);
  state.siteRules = rulesFrom(all, location.hostname);
  state.colors = colorsFrom(all);
  applyHighlightColors(state.colors);
  paintAllBadges();
  paintDialog();
}
