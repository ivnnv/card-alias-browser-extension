const P = globalThis.CardAliasPatterns;
const S = globalThis.CardAliasStore;
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function status(text) {
  $('status').textContent = text;
  setTimeout(() => ($('status').textContent = ''), 2500);
}

async function render() {
  const all = await S.loadAll();
  const cards = Object.values(S.cardsFrom(all)).sort((a, b) => a.alias.localeCompare(b.alias));
  const list = $('cards');
  list.replaceChildren();
  for (const card of cards) {
    const input = el('input', { type: 'text', value: card.alias, maxLength: 60 });
    const save = el('button', { textContent: 'Save' });
    const remove = el('button', { textContent: 'Delete' });
    save.onclick = async () => {
      const alias = input.value.trim();
      if (!alias) return status('Alias cannot be empty');
      await S.saveCard(card.brand, card.last4, alias);
      status('Saved');
    };
    input.onkeydown = (e) => e.key === 'Enter' && save.onclick();
    remove.onclick = async () => {
      if (!confirm(`Delete alias "${card.alias}"?`)) return;
      await S.removeCard(card.brand, card.last4);
    };
    list.append(el('li', {}, el('span', { className: 'card', textContent: `${P.LABELS[card.brand] || card.brand} •••• ${card.last4}` }), input, save, remove));
  }
  $('empty').hidden = cards.length > 0;

  const sites = Object.entries(all).filter(([key]) => key.startsWith('site:'));
  const siteList = $('sites');
  siteList.replaceChildren();
  for (const [key, rules] of sites) {
    const remove = el('button', { textContent: 'Forget' });
    remove.onclick = () => chrome.storage.sync.remove(key);
    const text = rules.map((r) => `${P.LABELS[r.brand] || r.brand}:${r.last4}`).join(', ');
    siteList.append(el('li', {}, el('span', { className: 'card', textContent: key.slice(5) }), el('span', { className: 'sub', textContent: text, style: 'flex:1' }), remove));
  }
  $('no-sites').hidden = sites.length > 0;
}

$('export').onclick = async () => {
  const blob = new Blob([JSON.stringify(await S.loadAll(), null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `card-aliases-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$('import').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const valid = Object.fromEntries(
      Object.entries(data).filter(([key, v]) =>
        (key.startsWith('card:') && /^\d{4,5}$/.test(v?.last4) && typeof v?.alias === 'string' && typeof v?.brand === 'string') ||
        (key.startsWith('site:') && Array.isArray(v))
      )
    );
    await chrome.storage.sync.set(valid);
    status(`Imported ${Object.keys(valid).length} entries`);
  } catch (err) {
    status(`Import failed: ${err.message}`);
  }
};

chrome.storage.onChanged.addListener((_, area) => area === 'sync' && render());
render();
