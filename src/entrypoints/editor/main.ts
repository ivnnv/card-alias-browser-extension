import {
  EDITOR_SOURCE,
  type EditorParams,
  type EditorPayload,
  type EditorSession,
  sessionKey,
} from '../../shared/editor.ts';
import { h } from '../../shared/h.ts';
import { type Brand, LABELS } from '../../shared/patterns.ts';
import {
  addSiteRule,
  cardsFrom,
  colorsFrom,
  find,
  loadAll,
  removeCard,
  removeSiteRule,
  saveCard,
} from '../../shared/store.ts';
import './editor.css';

const token = new URLSearchParams(location.search).get('t') ?? '';
const root = document.getElementById('editor')!;
let session!: EditorSession;
let params!: EditorParams;

function post(message: EditorPayload): void {
  chrome.tabs
    .sendMessage(session.tabId, { source: EDITOR_SOURCE, token, ...message }, { frameId: session.frameId })
    .catch(() => {});
}

const close = () => post({ type: 'close' });
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function showMsg(el: HTMLElement, text: string, error = false): void {
  el.textContent = text;
  el.className = `msg${error ? ' error' : ''}`;
}

const closeButton = () => h('button', { className: 'close', textContent: '×', title: 'Close', onclick: close });

/** Saved alias: read-only until ✏️, with a two-click delete. */
function renderInfo(alias: string, brand: Brand, last4: string): void {
  const input = h('input', { value: alias, disabled: true, maxLength: 60 });
  input.setAttribute('aria-label', 'Alias');
  const edit = h('button', { className: 'icon', textContent: '✏️', title: 'Edit alias' });
  const remove = h('button', { className: 'icon', textContent: '🗑', title: 'Delete alias' });
  const msg = h('div', { className: 'msg' });
  let saved = alias;
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
    const value = input.value.trim();
    if (!value) return showMsg(msg, 'Alias cannot be empty', true);
    try {
      await saveCard(brand, last4, value);
      saved = value;
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
      e.stopPropagation();
      input.value = saved;
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
      await removeCard(brand, last4);
      await removeSiteRule(params.host, brand, last4);
      await removeSiteRule(params.host, params.shownBrand, params.shownLast4);
      close();
    } catch (err) {
      showMsg(msg, `Could not delete: ${errorText(err)}`, true);
    }
  });

  root.replaceChildren(
    closeButton(),
    h('h2', { textContent: `${LABELS[brand]} •••• ${last4}` }),
    h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), input, edit, remove),
    msg,
  );
  edit.focus();
}

function renderAdd(): void {
  const title = h('h2');
  const brandSelect = h('select');
  for (const [value, text] of Object.entries(LABELS)) brandSelect.append(h('option', { value, textContent: text }));
  brandSelect.value = params.brand;
  const digits = h('input', { value: params.last4, maxLength: 5, inputMode: 'numeric', placeholder: '2071' });
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
      if (params.manual) await addSiteRule(params.host, c.brand, c.last4);
      post({ type: 'saved', brand: c.brand, last4: c.last4 });
      showMsg(msg, `Alias for ${LABELS[c.brand]}:${c.last4} saved`);
      setTimeout(close, 1200);
    } catch (err) {
      saveBtn.disabled = false;
      showMsg(msg, `Could not save: ${errorText(err)}`, true);
    }
  };
  saveBtn.addEventListener('click', save);
  alias.addEventListener('keydown', (e) => e.key === 'Enter' && void save());

  root.replaceChildren(
    closeButton(),
    title,
    ...(params.manual ? [h('div', { className: 'row' }, brandSelect, digits)] : []),
    h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), alias),
    msg,
    h('div', { className: 'actions' }, h('button', { textContent: 'Cancel', onclick: close }), saveBtn),
  );
  (params.manual && !params.last4 ? digits : alias).focus();
}

/** Single use: a reload or a copied URL finds nothing and renders nothing. */
async function claimSession(): Promise<EditorSession | null> {
  if (!token) return null;
  const key = sessionKey(token);
  const found = (await chrome.storage.session.get(key))[key] as EditorSession | undefined;
  await chrome.storage.session.remove(key);
  return found && found.expires > Date.now() ? found : null;
}

const claimed = await claimSession();
if (claimed) {
  session = claimed;
  params = claimed.params;
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  new ResizeObserver(() => post({ type: 'resize', height: Math.ceil(root.getBoundingClientRect().height) })).observe(
    root,
  );
  const all = await loadAll();
  document.documentElement.style.setProperty('--ca-known', colorsFrom(all).knownColor);
  const card = params.mode === 'info' ? find(cardsFrom(all), params.brand, params.last4) : null;
  if (card) renderInfo(card.alias, card.brand, card.last4);
  else renderAdd();
}
