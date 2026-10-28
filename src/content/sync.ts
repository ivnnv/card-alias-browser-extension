import { cardsFrom, colorsFrom, loadAll, rulesFrom } from '../shared/store';
import { paintAllBadges } from './badges';
import { paintDialog } from './dialog';
import { applyHighlightColors } from './highlights';
import { state } from './state';

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
