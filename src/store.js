(function (root) {
  const area = () => chrome.storage.sync;
  const cardKey = (brand, last4) => `card:${brand}:${last4}`;
  const siteKey = (host) => `site:${host}`;

  function cardsFrom(all) {
    const cards = {};
    for (const [key, value] of Object.entries(all || {})) if (key.startsWith('card:')) cards[key] = value;
    return cards;
  }

  // A generic "card" on either side matches any brand, as long as only one card has those digits.
  function find(cards, brand, last4) {
    const exact = cards[cardKey(brand, last4)];
    if (exact) return exact;
    const same = Object.values(cards).filter(
      (c) => c.last4 === last4 && (brand === 'card' || c.brand === 'card')
    );
    return same.length === 1 ? same[0] : null;
  }

  async function loadAll() {
    return area().get(null);
  }

  async function saveCard(brand, last4, alias) {
    await area().set({ [cardKey(brand, last4)]: { brand, last4, alias, updatedAt: Date.now() } });
  }

  async function removeCard(brand, last4) {
    await area().remove(cardKey(brand, last4));
  }

  async function addSiteRule(host, brand, last4) {
    const key = siteKey(host);
    const rules = (await area().get(key))[key] || [];
    if (rules.some((r) => r.brand === brand && r.last4 === last4)) return;
    await area().set({ [key]: [...rules, { brand, last4 }] });
  }

  async function removeSiteRule(host, brand, last4) {
    const key = siteKey(host);
    const rules = (await area().get(key))[key] || [];
    const kept = rules.filter((r) => !(r.brand === brand && r.last4 === last4));
    if (kept.length === rules.length) return;
    if (kept.length) await area().set({ [key]: kept });
    else await area().remove(key);
  }

  const SETTINGS_KEY = 'settings';
  const DEFAULT_COLORS = { newColor: '#d97706', knownColor: '#3b82f6' };

  function colorsFrom(all) {
    return { ...DEFAULT_COLORS, ...(all?.[SETTINGS_KEY]?.colors || {}) };
  }

  async function saveColors(colors) {
    await area().set({ [SETTINGS_KEY]: { colors } });
  }

  const api = {
    SETTINGS_KEY,
    DEFAULT_COLORS,
    cardKey,
    siteKey,
    cardsFrom,
    colorsFrom,
    find,
    loadAll,
    saveCard,
    saveColors,
    removeCard,
    addSiteRule,
    removeSiteRule,
  };
  root.CardAliasStore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
