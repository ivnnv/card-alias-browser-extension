import { type Brand, LABELS } from '../shared/patterns';
import { addSiteRule, type Card, removeCard, removeSiteRule, saveCard } from '../shared/store';
import { annotateTarget, renderAll } from './badges';
import dialogCss from './dialog.css?inline';
import { h, isolate } from './dom';
import { state, UI_ATTR } from './state';
import { refresh } from './sync';

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

let current: { host: HTMLDialogElement; panel: HTMLDivElement } | null = null;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function closeDialog(): void {
  if (current?.host.open) current.host.close();
  current?.host.remove();
  current = null;
}

export function paintDialog(): void {
  current?.host.style.setProperty('--ca-known', state.colors.knownColor);
}

// A native modal <dialog> sits in the top layer, above page modals and clear of
// their clipping. It is mounted inside the page's own modal when there is one,
// so div-based focus traps still see focus as inside.
function mountDialog(anchor: Element | null, modal: boolean): HTMLDivElement {
  closeDialog();
  const container = anchor?.closest('dialog,[role=dialog],[aria-modal=true]') ?? document.documentElement;
  const host = document.createElement('dialog');
  host.setAttribute(UI_ATTR, 'dialog');
  for (const [k, v] of Object.entries(HOST_RESET)) host.style.setProperty(k, v, 'important');
  const inner = document.createElement('card-alias-dialog');
  const shadow = inner.attachShadow({ mode: 'closed' });
  const layer = h('div', { className: `layer${modal ? ' modal' : ''}` });
  const panel = h('div', { className: 'panel' });
  shadow.append(h('style', { textContent: dialogCss }), layer, panel);
  host.append(inner);
  layer.addEventListener('click', closeDialog);
  host.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });
  isolate(host);
  container.append(host);
  host.showModal();
  current = { host, panel };
  paintDialog();
  return panel;
}

function place(panel: HTMLElement, anchor: Element | null): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = panel.offsetWidth;
  const ph = panel.offsetHeight;
  if (!anchor) {
    panel.style.left = `${Math.max(8, (vw - w) / 2)}px`;
    panel.style.top = `${Math.max(8, (vh - ph) / 3)}px`;
    return;
  }
  const a = anchor.getBoundingClientRect();
  const top = a.bottom + 8 + ph > vh ? a.top - 8 - ph : a.bottom + 8;
  panel.style.left = `${Math.min(Math.max(8, a.left - 12), vw - w - 8)}px`;
  panel.style.top = `${Math.max(8, top)}px`;
}

function showMsg(el: HTMLElement, text: string, error = false): void {
  el.textContent = text;
  el.className = `msg${error ? ' error' : ''}`;
}

const closeButton = () => h('button', { className: 'close', textContent: '×', title: 'Close', onclick: closeDialog });

/** Saved alias: read-only until ✏️, with a two-click delete. */
export function openInfo(card: Card, anchor: Element): void {
  const panel = mountDialog(anchor, false);
  const input = h('input', { value: card.alias, disabled: true, maxLength: 60 });
  input.setAttribute('aria-label', 'Alias');
  const edit = h('button', { className: 'icon', textContent: '✏️', title: 'Edit alias' });
  const remove = h('button', { className: 'icon', textContent: '🗑', title: 'Delete alias' });
  const msg = h('div', { className: 'msg' });
  let editing = false;

  const setEditing = (on: boolean) => {
    editing = on;
    input.disabled = !on;
    edit.textContent = on ? '💾' : '✏️';
    edit.title = on ? 'Save alias' : 'Edit alias';
    if (on) {
      input.focus();
      input.select();
    }
  };

  const save = async () => {
    const alias = input.value.trim();
    if (!alias) return showMsg(msg, 'Alias cannot be empty', true);
    try {
      await saveCard(card.brand, card.last4, alias);
      card.alias = alias;
      setEditing(false);
      showMsg(msg, 'Saved');
    } catch (err) {
      showMsg(msg, `Could not save: ${errorText(err)}`, true);
    }
  };

  edit.addEventListener('click', () => (editing ? save() : setEditing(true)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void save();
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      input.value = card.alias;
      setEditing(false);
    }
  });

  remove.addEventListener('click', async () => {
    if (!remove.classList.contains('armed')) {
      remove.classList.add('armed');
      remove.textContent = 'Delete?';
      return;
    }
    try {
      await removeCard(card.brand, card.last4);
      await removeSiteRule(location.hostname, card.brand, card.last4);
      await refresh();
      renderAll();
      closeDialog();
    } catch (err) {
      showMsg(msg, `Could not delete: ${errorText(err)}`, true);
    }
  });

  panel.append(
    closeButton(),
    h('h2', { textContent: `${LABELS[card.brand]} •••• ${card.last4}` }),
    h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), input, edit, remove),
    msg,
  );
  place(panel, anchor);
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
  const panel = mountDialog(anchor ?? target, true);
  const title = h('h2');
  const brandSelect = h('select');
  for (const [value, text] of Object.entries(LABELS)) brandSelect.append(h('option', { value, textContent: text }));
  brandSelect.value = brand;
  const digits = h('input', { value: last4, maxLength: 5, inputMode: 'numeric', placeholder: '2071' });
  const alias = h('input', { maxLength: 60, placeholder: 'e.g. Revolut personal' });
  alias.setAttribute('aria-label', 'Alias');
  const msg = h('div', { className: 'msg' });
  const saveBtn = h('button', { className: 'primary', textContent: 'Save' });

  const chosen = () => ({ brand: brandSelect.value as Brand, last4: digits.value.trim() });
  const updateTitle = () => {
    const c = chosen();
    title.textContent = `Add Card Alias for ${LABELS[c.brand]}:${c.last4 || '????'}`;
  };
  brandSelect.addEventListener('change', updateTitle);
  digits.addEventListener('input', updateTitle);
  updateTitle();

  const save = async () => {
    const c = chosen();
    const value = alias.value.trim();
    if (!/^\d{4,5}$/.test(c.last4)) return showMsg(msg, 'Last digits must be 4 or 5 numbers', true);
    if (!value) return showMsg(msg, 'Alias cannot be empty', true);
    saveBtn.disabled = true;
    try {
      await saveCard(c.brand, c.last4, value);
      if (manual) {
        await addSiteRule(location.hostname, c.brand, c.last4);
        annotateTarget(target, c.brand, c.last4);
      }
      await refresh();
      renderAll();
      showMsg(msg, `Alias for ${LABELS[c.brand]}:${c.last4} saved`);
      setTimeout(closeDialog, 1200);
    } catch (err) {
      saveBtn.disabled = false;
      showMsg(msg, `Could not save: ${errorText(err)}`, true);
    }
  };
  saveBtn.addEventListener('click', save);
  alias.addEventListener('keydown', (e) => e.key === 'Enter' && void save());

  panel.append(
    closeButton(),
    title,
    ...(manual ? [h('div', { className: 'row' }, brandSelect, digits)] : []),
    h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), alias),
    msg,
    h('div', { className: 'actions' }, h('button', { textContent: 'Cancel', onclick: closeDialog }), saveBtn),
  );
  place(panel, null);
  (manual && !last4 ? digits : alias).focus();
}
