import { EDITOR_SOURCE, type EditorMessage, type EditorParams, editorUrl } from '../shared/editor.ts';
import { h } from '../shared/h.ts';
import type { Brand } from '../shared/patterns.ts';
import type { Card, SiteRule } from '../shared/store.ts';
import { annotateTarget } from './badges.ts';
import dialogCss from './dialog.css?inline';
import { isolate } from './dom.ts';
import { UI_ATTR } from './state.ts';

const HOST_RESET: Record<string, string> = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  'max-width': 'none',
  'max-height': 'none',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
  display: 'block',
  transform: 'none',
  'color-scheme': 'normal',
};

interface Open {
  host: HTMLDialogElement;
  frame: HTMLIFrameElement;
  anchor: Element | null;
  target: Element | null;
}

let current: Open | null = null;

export function closeDialog(): void {
  if (current?.host.open) current.host.close();
  current?.host.remove();
  current = null;
}

function place({ frame, anchor }: Open): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = frame.offsetWidth;
  const fh = frame.offsetHeight;
  if (!anchor) {
    frame.style.left = `${Math.max(8, (vw - w) / 2)}px`;
    frame.style.top = `${Math.max(8, (vh - fh) / 3)}px`;
    return;
  }
  const a = anchor.getBoundingClientRect();
  const top = a.bottom + 8 + fh > vh ? a.top - 8 - fh : a.bottom + 8;
  frame.style.left = `${Math.min(Math.max(8, a.left - 12), vw - w - 8)}px`;
  frame.style.top = `${Math.max(8, top)}px`;
}

// Only our own editor frame may drive the dialog; the page can post look-alike messages.
window.addEventListener('message', (e: MessageEvent<EditorMessage>) => {
  if (!current || e.source !== current.frame.contentWindow || e.data?.source !== EDITOR_SOURCE) return;
  if (e.data.type === 'close') closeDialog();
  else if (e.data.type === 'resize') {
    current.frame.style.height = `${e.data.height}px`;
    place(current);
  } else if (e.data.type === 'saved') {
    annotateTarget(current.target, e.data.brand, e.data.last4);
  }
});

/**
 * The form is an extension page in an iframe, so the visited page can't read
 * keystrokes or the alias. A native modal <dialog> keeps it in the top layer,
 * above page modals; it mounts inside the page's own modal when there is one,
 * so div-based focus traps still see focus as inside.
 */
function openEditor(params: EditorParams, anchor: Element | null, target: Element | null, modal: boolean): void {
  closeDialog();
  const container = (anchor ?? target)?.closest('dialog,[role=dialog],[aria-modal=true]') ?? document.documentElement;
  const host = document.createElement('dialog');
  host.setAttribute(UI_ATTR, 'dialog');
  for (const [k, v] of Object.entries(HOST_RESET)) host.style.setProperty(k, v, 'important');
  const inner = document.createElement('card-alias-dialog');
  const shadow = inner.attachShadow({ mode: 'closed' });
  const layer = h('div', { className: `layer${modal ? ' modal' : ''}` });
  const frame = h('iframe', { src: editorUrl(chrome.runtime.getURL('/editor.html'), params), title: 'Card Alias' });
  shadow.append(h('style', { textContent: dialogCss }), layer, frame);
  host.append(inner);
  layer.addEventListener('click', closeDialog);
  host.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });
  isolate(host);
  container.append(host);
  host.showModal();
  current = { host, frame, anchor, target };
  place(current);
  frame.addEventListener('load', () => frame.focus());
}

/** Saved alias, opened from an `i` badge. `shown` is what the badge matched. */
export function openInfo(card: Card, anchor: Element, shown: SiteRule): void {
  openEditor(
    {
      mode: 'info',
      brand: card.brand,
      last4: card.last4,
      host: location.hostname,
      manual: false,
      shownBrand: shown.brand,
      shownLast4: shown.last4,
    },
    anchor,
    null,
    false,
  );
}

interface AddOptions {
  brand: Brand;
  last4: string;
  anchor?: Element | null;
  /** Opened from the context menu: brand and digits are editable and saved as a site rule. */
  manual?: boolean;
  target?: Element | null;
}

export function openAdd({ brand, last4, anchor = null, manual = false, target = null }: AddOptions): void {
  openEditor(
    { mode: 'add', brand, last4, host: location.hostname, manual, shownBrand: brand, shownLast4: last4 },
    null,
    target ?? anchor,
    true,
  );
}
