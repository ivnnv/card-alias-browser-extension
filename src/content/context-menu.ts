import { ADD_ALIAS, type Message } from '../shared/messages';
import { analyze, brandOf } from '../shared/patterns';
import { openAdd } from './dialog';
import { digitsIn, findRow, hintsOf, textOf } from './dom';

let lastTarget: Element | null = null;

/** Opens the add dialog for whatever was right-clicked, prefilled with the best guess. */
export function listenForContextMenu(): void {
  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.composedPath()[0];
      lastTarget = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
    },
    true,
  );

  chrome.runtime.onMessage.addListener((msg: Message) => {
    if (msg.type !== ADD_ALIAS) return;
    const target = lastTarget?.isConnected ? lastTarget : null;
    const row = target ? findRow(target, digitsIn(target.textContent ?? '')) : null;
    const hints = row ? hintsOf(row) : { labels: '', brandHints: '' };
    const text = msg.selection || (row ? textOf(row) : '');
    const found = analyze(text, hints.labels, hints.brandHints, { requireContext: false })[0];
    openAdd({
      brand: found?.brand ?? brandOf(`${text} ${hints.labels}`) ?? brandOf(hints.brandHints) ?? 'card',
      last4: found?.suffix ?? [...digitsIn(text)].pop()?.slice(-4) ?? '',
      manual: true,
      target,
    });
  });
}
