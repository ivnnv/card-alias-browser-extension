import { type Brand, LABELS } from '../../shared/patterns.ts';
import {
  type Card,
  cardsFrom,
  colorsFrom,
  DEFAULT_COLORS,
  importable,
  loadAll,
  removeCard,
  saveCard,
  saveColors,
  type SiteRule,
} from '../../shared/store.ts';
import { h as el } from '../../shared/h.ts';
import './options.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const label = (brand: Brand) => LABELS[brand] ?? brand;

function status(text: string): void {
  $('status').textContent = text;
  setTimeout(() => ($('status').textContent = ''), 2500);
}

function cardRow(card: Card): HTMLLIElement {
  const input = el('input', { type: 'text', value: card.alias, maxLength: 60 });
  const save = el('button', { textContent: 'Save' });
  const remove = el('button', { textContent: 'Delete' });
  const doSave = async () => {
    const alias = input.value.trim();
    if (!alias) return status('Alias cannot be empty');
    await saveCard(card.brand, card.last4, alias);
    status('Saved');
  };
  save.addEventListener('click', doSave);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && void doSave());
  remove.addEventListener('click', async () => {
    if (confirm(`Delete alias "${card.alias}"?`)) await removeCard(card.brand, card.last4);
  });
  return el(
    'li',
    {},
    el('span', { className: 'card', textContent: `${label(card.brand)} •••• ${card.last4}` }),
    input,
    save,
    remove,
  );
}

function siteRow(key: string, rules: SiteRule[]): HTMLLIElement {
  const forget = el('button', { textContent: 'Forget' });
  forget.addEventListener('click', () => chrome.storage.sync.remove(key));
  const text = rules.map((r) => `${label(r.brand)}:${r.last4}`).join(', ');
  return el(
    'li',
    {},
    el('span', { className: 'card', textContent: key.slice('site:'.length) }),
    el('span', { className: 'sub grow', textContent: text }),
    forget,
  );
}

async function render(): Promise<void> {
  const all = await loadAll();
  const cards = Object.values(cardsFrom(all)).toSorted((a, b) => a.alias.localeCompare(b.alias));
  $('cards').replaceChildren(...cards.map(cardRow));
  $('empty').hidden = cards.length > 0;

  const sites = Object.entries(all).filter(([key]) => key.startsWith('site:')) as [string, SiteRule[]][];
  $('sites').replaceChildren(...sites.map(([key, rules]) => siteRow(key, rules)));
  $('no-sites').hidden = sites.length > 0;

  const colors = colorsFrom(all);
  $<HTMLInputElement>('new-color').value = colors.newColor;
  $<HTMLInputElement>('known-color').value = colors.knownColor;
}

// 'change' fires once the picker closes, so dragging doesn't hit the sync write quota.
for (const id of ['new-color', 'known-color']) {
  $(id).addEventListener('change', () =>
    saveColors({
      newColor: $<HTMLInputElement>('new-color').value,
      knownColor: $<HTMLInputElement>('known-color').value,
    }),
  );
}
$('reset-colors').addEventListener('click', () => saveColors({ ...DEFAULT_COLORS }));

$('export').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(await loadAll(), null, 2)], { type: 'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `card-aliases-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import-button').addEventListener('click', () => $('import').click());

$('import').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const valid = importable(JSON.parse(await file.text()));
    await chrome.storage.sync.set(valid);
    status(`Imported ${Object.keys(valid).length} entries`);
  } catch (err) {
    status(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

chrome.storage.onChanged.addListener((_, area) => area === 'sync' && void render());
void render();
