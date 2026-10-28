(() => {
  if (window.__cardAliasLoaded) return;
  window.__cardAliasLoaded = true;

  const P = globalThis.CardAliasPatterns;
  const S = globalThis.CardAliasStore;
  const UI_ATTR = 'data-card-alias-ui';
  const ROW_MAX = 160;
  const ROW_STOP = 'li,tr,label,button,a,[role=option],[role=radio],[role=button],[role=menuitem],[role=menuitemradio],[role=listitem],[role=row]';
  const SKIP = 'script,style,noscript,textarea,input,select,option,template,[contenteditable=""],[contenteditable="true"]';
  const ISOLATED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress'];

  let cards = {};
  let siteRules = [];
  let lastContextTarget = null;
  const annotated = new Map();
  const observedRoots = new WeakSet();

  const label = (brand) => P.LABELS[brand] || P.LABELS.card;
  const digitsIn = (text) => new Set(String(text).replace(/\d{1,2}\s*\/\s*\d{2,4}/g, '').match(/\d{4,}/g) || []);
  const standalone = (digits) => new RegExp(`(?<!\\d)${digits}(?!\\d)`);

  async function refreshState() {
    const all = await S.loadAll();
    cards = S.cardsFrom(all);
    siteRules = all[S.siteKey(location.hostname)] || [];
    applyColors(S.colorsFrom(all));
  }

  // ---------- colors ----------

  let colors = S.DEFAULT_COLORS;
  const pageSheet = new CSSStyleSheet();

  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function applyColors(next) {
    colors = next;
    pageSheet.replaceSync(`
      ::highlight(card-alias-new) { background-color: ${rgba(colors.newColor, 0.2)}; text-decoration: underline dotted 2px ${colors.newColor}; }
      ::highlight(card-alias-known) { background-color: ${rgba(colors.knownColor, 0.2)}; text-decoration: underline dotted 2px ${colors.knownColor}; }
      ::highlight(card-alias-flash) { background-color: ${rgba(colors.newColor, 0.55)}; }`);
    for (const rec of annotated.values()) paintBadge(rec.host);
    dialog?.host.style.setProperty('--ca-known', colors.knownColor);
  }

  // A constructed sheet is not subject to the page's style-src CSP. Shadow roots need their own adoption.
  function adoptSheet(root) {
    if (!root.adoptedStyleSheets.includes(pageSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, pageSheet];
  }

  function paintBadge(host) {
    host.style.setProperty('--ca-new', colors.newColor);
    host.style.setProperty('--ca-known', colors.knownColor);
  }

  // ---------- reading the page ----------

  // Text of root with each text node's offset, joined by spaces so separate
  // elements never glue digits together ("7788" + "12 Oct" must not read "778812").
  function textMap(root) {
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest(`[${UI_ATTR}]`)) continue;
      if (text) text += ' ';
      nodes.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { text, nodes };
  }

  function textOf(root) {
    return P.normalize(textMap(root).text);
  }

  function pointAt(map, index, isEnd) {
    const probe = isEnd ? index - 1 : index;
    let entry = map.nodes[0];
    for (const e of map.nodes) {
      if (e.start > probe) break;
      entry = e;
    }
    return [entry.node, Math.min(Math.max(index - entry.start, 0), entry.node.nodeValue.length)];
  }

  // The exact matched phrase inside row, ending in node; just the digits when nothing wider matches.
  function rangeFor(row, node, suffix) {
    const range = document.createRange();
    const map = textMap(row);
    const own = map.nodes.find((e) => e.node === node);
    if (own) {
      const nodeEnd = own.start + node.nodeValue.length;
      const span = P.locate(map.text, suffix).find((s) => s.end > own.start && s.end <= nodeEnd);
      if (span) {
        range.setStart(...pointAt(map, span.start, false));
        range.setEnd(...pointAt(map, span.end, true));
        return range;
      }
    }
    const at = Math.max(node.nodeValue.search(standalone(suffix)), 0);
    range.setStart(node, at);
    range.setEnd(node, Math.min(at + suffix.length, node.nodeValue.length));
    return range;
  }

  // Smallest ancestor that still looks like one payment row: stops at list items,
  // buttons and options, at ~160 chars, or where another card number appears.
  function findRow(el, ownDigits) {
    let row = el;
    for (let i = 0; i < 6 && !row.matches(ROW_STOP); i++) {
      const parent = row.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if ((parent.textContent || '').length > ROW_MAX) break;
      const isYear = (d) => /^(?:19|20)\d\d$/.test(d);
      if ([...digitsIn(textOf(parent))].some((d) => !ownDigits.has(d) && !isYear(d))) break;
      row = parent;
    }
    return row;
  }

  function hintsOf(row) {
    const labels = [];
    const brandHints = [];
    const els = [row, ...row.querySelectorAll('img,svg,[aria-label],[title],[alt],[class],[src]')].slice(0, 40);
    for (const e of els) {
      if (e.closest(`[${UI_ATTR}]`)) continue;
      labels.push(e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('title'));
      if (e.localName === 'svg') labels.push(e.querySelector('title')?.textContent);
      brandHints.push(e.getAttribute('class'), (e.getAttribute('src') || '').split('/').pop());
    }
    const join = (list) => list.filter(Boolean).join(' ').replace(/[-_.]/g, ' ');
    return { labels: join(labels), brandHints: join(brandHints) };
  }

  function handleTextNode(node) {
    const el = node.parentElement;
    if (!el || el.closest(SKIP) || el.closest(`[${UI_ATTR}]`) || el.isContentEditable) return;
    const own = digitsIn(node.nodeValue);
    if (!own.size) return;
    const row = findRow(el, own);
    const { labels, brandHints } = hintsOf(row);
    const found = P.analyze(textOf(row), labels, brandHints);
    let hit = found.find((m) => [...own].some((d) => d.endsWith(m.suffix) && d.length === m.suffix.length));
    if (!hit) {
      const rule = siteRules.find((r) => standalone(r.last4).test(node.nodeValue));
      if (rule) hit = { suffix: rule.last4, brand: rule.brand, manual: true };
    }
    if (hit) annotate(el, hit.brand, hit.suffix, !!hit.manual, node, row);
  }

  function scan(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\d{4}/.test(n.nodeValue)) nodes.push(n);
    nodes.forEach(handleTextNode);
    if (root.querySelectorAll) {
      for (const host of root.querySelectorAll('*')) {
        if (host.shadowRoot && !observedRoots.has(host.shadowRoot)) {
          observe(host.shadowRoot);
          scan(host.shadowRoot);
        }
      }
    }
  }

  // ---------- badges ----------

  const BADGE_CSS = `
    button { all: unset; box-sizing: border-box; width: 18px; height: 18px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      font: 700 12px/1 -apple-system, system-ui, sans-serif; color: #fff; background: var(--ca-new);
      box-shadow: 0 0 0 2px rgba(0,0,0,.18); }
    button.known { background: var(--ca-known); font: italic 700 12px/1 Georgia, serif; }
    button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }`;

  function isolate(host) {
    for (const type of ISOLATED_EVENTS) host.addEventListener(type, (e) => e.stopPropagation());
  }

  // Highlights paint the matched text without touching the page's DOM or layout.
  const HL = { new: new Highlight(), known: new Highlight(), flash: new Highlight() };
  HL.flash.priority = 1;
  CSS.highlights.set('card-alias-new', HL.new);
  CSS.highlights.set('card-alias-known', HL.known);
  CSS.highlights.set('card-alias-flash', HL.flash);

  function flash(range) {
    let ticks = 0;
    const timer = setInterval(() => {
      if (ticks % 2 === 0) HL.flash.add(range);
      else HL.flash.delete(range);
      if (++ticks >= 6) {
        clearInterval(timer);
        HL.flash.delete(range);
      }
    }, 350);
  }

  // The badge goes right after the text node holding the digits, not at the end of el.
  function annotate(el, brand, last4, manual = false, textNode = null, row = null) {
    const prev = annotated.get(el);
    if (prev && prev.brand === brand && prev.last4 === last4 && prev.host.isConnected && !prev.range.collapsed) return;
    if (prev) unannotate(prev);

    let range;
    if (textNode) range = rangeFor(row || findRow(el, digitsIn(textNode.nodeValue)), textNode, last4);
    else {
      range = document.createRange();
      range.selectNodeContents(el);
    }

    const host = document.createElement('card-alias-badge');
    host.setAttribute(UI_ATTR, 'badge');
    for (const [k, v] of [['display', 'inline-block'], ['vertical-align', 'middle'], ['margin', '0 0 0 6px'], ['line-height', '0'], ['position', 'relative']]) {
      host.style.setProperty(k, v, 'important');
    }
    paintBadge(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = BADGE_CSS;
    const button = document.createElement('button');
    button.type = 'button';
    shadow.append(style, button);

    const rec = { el, host, button, brand, last4, manual, range };
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const card = S.find(cards, rec.brand, rec.last4);
      if (card) openInfo(card, host);
      else openAdd({ brand: rec.brand, last4: rec.last4, anchor: host });
    });
    isolate(host);
    for (const type of ['click', 'mousedown', 'pointerdown']) host.addEventListener(type, (e) => e.preventDefault());

    if (textNode?.parentNode === el) textNode.after(host);
    else el.appendChild(host);
    annotated.set(el, rec);
    render(rec);
    flash(range);
  }

  function unannotate(rec) {
    rec.host.remove();
    for (const h of Object.values(HL)) h.delete(rec.range);
    annotated.delete(rec.el);
  }

  function render(rec) {
    const card = S.find(cards, rec.brand, rec.last4);
    rec.button.textContent = card ? 'i' : '+';
    rec.button.className = card ? 'known' : '';
    rec.button.title = card ? `Alias: ${card.alias}` : `Add alias for ${label(rec.brand)}:${rec.last4}`;
    rec.button.setAttribute('aria-label', rec.button.title);
    HL[card ? 'known' : 'new'].add(rec.range);
    HL[card ? 'new' : 'known'].delete(rec.range);
  }

  function renderAll() {
    for (const rec of [...annotated.values()]) {
      const ruleGone = rec.manual && !siteRules.some((r) => r.brand === rec.brand && r.last4 === rec.last4);
      if (!rec.el.isConnected || rec.range.collapsed || ruleGone || !standalone(rec.last4).test(textOf(rec.el))) unannotate(rec);
      else render(rec);
    }
  }

  // ---------- dialog ----------

  const DIALOG_CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; }
    .layer.modal { background: rgba(0,0,0,.45); }
    .panel { position: fixed; box-sizing: border-box; width: 300px; max-width: calc(100vw - 16px);
      padding: 14px; border-radius: 12px; font: 14px/1.4 -apple-system, system-ui, sans-serif;
      color: #111; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
    h2 { margin: 0 0 10px; padding-right: 24px; font-size: 15px; font-weight: 600; }
    .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
    .row > span { flex: none; color: #555; }
    input, select { flex: 1; min-width: 0; font: inherit; padding: 6px 8px; border: 1px solid #ccc;
      border-radius: 8px; color: inherit; background: #fff; }
    input:disabled { background: #e5e7eb; border-color: transparent; color: #4b5563; -webkit-text-fill-color: #4b5563; cursor: default; }
    input:not(:disabled):focus { outline: none; border-color: var(--ca-known); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ca-known) 30%, transparent); }
    button { font: inherit; padding: 6px 10px; border: 0; border-radius: 8px; cursor: pointer; background: #eee; color: inherit; }
    button.primary { background: var(--ca-known); color: #fff; }
    button.armed { background: #dc2626; color: #fff; }
    .icon { padding: 6px 8px; }
    .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
    .msg { margin-top: 10px; font-size: 13px; color: #059669; }
    .msg.error { color: #dc2626; }
    .close { position: absolute; top: 8px; right: 8px; padding: 2px 8px; background: transparent; }
    @media (prefers-color-scheme: dark) {
      .panel { color: #eee; background: #1f1f22; }
      .row > span { color: #aaa; }
      input, select { border-color: #444; background: #2a2a2e; }
      input:disabled { background: #111113; border-color: transparent; color: #a1a1aa; -webkit-text-fill-color: #a1a1aa; }
      button { background: #333; }
    }`;

  let dialog = null;

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    el.append(...children);
    return el;
  }

  function closeDialog() {
    if (dialog?.host.open) dialog.host.close();
    dialog?.host.remove();
    dialog = null;
  }

  // A native modal <dialog> sits in the top layer, above page modals and clear of
  // their clipping. It is mounted inside the page's own modal when there is one,
  // so div-based focus traps still see focus as inside.
  function mountDialog(anchor, modal) {
    closeDialog();
    const container = anchor?.closest('dialog,[role=dialog],[aria-modal=true]') || document.documentElement;
    const host = document.createElement('dialog');
    host.setAttribute(UI_ATTR, 'dialog');
    const reset = {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', 'max-width': 'none', 'max-height': 'none',
      margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible', display: 'block',
      transform: 'none', 'color-scheme': 'normal',
    };
    for (const [k, v] of Object.entries(reset)) host.style.setProperty(k, v, 'important');
    host.style.setProperty('--ca-known', colors.knownColor);
    const inner = document.createElement('card-alias-dialog');
    const shadow = inner.attachShadow({ mode: 'closed' });
    const layer = h('div', { className: `layer${modal ? ' modal' : ''}` });
    const panel = h('div', { className: 'panel' });
    shadow.append(h('style', { textContent: DIALOG_CSS }), layer, panel);
    host.append(inner);
    layer.addEventListener('click', closeDialog);
    host.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeDialog();
    });
    isolate(host);
    container.appendChild(host);
    host.showModal();
    dialog = { host, panel };
    return panel;
  }

  function place(panel, anchor) {
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

  function openInfo(card, anchor) {
    const panel = mountDialog(anchor, false);
    const input = h('input', { value: card.alias, disabled: true, maxLength: 60 });
    input.setAttribute('aria-label', 'Alias');
    const edit = h('button', { className: 'icon', textContent: '✏️', title: 'Edit alias' });
    const msg = h('div', { className: 'msg' });
    let editing = false;

    async function save() {
      const alias = input.value.trim();
      if (!alias) return showMsg(msg, 'Alias cannot be empty', true);
      try {
        await S.saveCard(card.brand, card.last4, alias);
        card.alias = alias;
        setEditing(false);
        showMsg(msg, 'Saved');
      } catch (err) {
        showMsg(msg, `Could not save: ${err.message}`, true);
      }
    }
    function setEditing(on) {
      editing = on;
      input.disabled = !on;
      edit.textContent = on ? '💾' : '✏️';
      edit.title = on ? 'Save alias' : 'Edit alias';
      if (on) {
        input.focus();
        input.select();
      }
    }
    edit.addEventListener('click', () => (editing ? save() : setEditing(true)));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape' && editing) {
        e.preventDefault();
        input.value = card.alias;
        setEditing(false);
      }
    });

    // First click arms it, second click deletes.
    const remove = h('button', { className: 'icon', textContent: '🗑', title: 'Delete alias' });
    remove.addEventListener('click', async () => {
      if (!remove.classList.contains('armed')) {
        remove.classList.add('armed');
        remove.textContent = 'Delete?';
        return;
      }
      try {
        await S.removeCard(card.brand, card.last4);
        await S.removeSiteRule(location.hostname, card.brand, card.last4);
        await refreshState();
        renderAll();
        closeDialog();
      } catch (err) {
        showMsg(msg, `Could not delete: ${err.message}`, true);
      }
    });

    panel.append(
      h('button', { className: 'close', textContent: '×', title: 'Close', onclick: closeDialog }),
      h('h2', { textContent: `${label(card.brand)} •••• ${card.last4}` }),
      h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), input, edit, remove),
      msg
    );
    place(panel, anchor);
  }

  // manual: opened from the context menu, so brand and digits are editable.
  function openAdd({ brand, last4, anchor = null, manual = false, target = null }) {
    const panel = mountDialog(anchor || target, true);
    const title = h('h2');
    const brandSelect = h('select');
    for (const [value, text] of Object.entries(P.LABELS)) brandSelect.append(h('option', { value, textContent: text }));
    brandSelect.value = brand;
    const digits = h('input', { value: last4, maxLength: 5, inputMode: 'numeric', placeholder: '2071' });
    const alias = h('input', { maxLength: 60, placeholder: 'e.g. Revolut personal' });
    alias.setAttribute('aria-label', 'Alias');
    const msg = h('div', { className: 'msg' });
    const saveBtn = h('button', { className: 'primary', textContent: 'Save' });

    const current = () => ({ brand: brandSelect.value, last4: digits.value.trim() });
    const updateTitle = () => {
      const c = current();
      title.textContent = `Add Card Alias for ${label(c.brand)}:${c.last4 || '????'}`;
    };
    brandSelect.addEventListener('change', updateTitle);
    digits.addEventListener('input', updateTitle);
    updateTitle();

    async function save() {
      const c = current();
      const value = alias.value.trim();
      if (!/^\d{4,5}$/.test(c.last4)) return showMsg(msg, 'Last digits must be 4 or 5 numbers', true);
      if (!value) return showMsg(msg, 'Alias cannot be empty', true);
      saveBtn.disabled = true;
      try {
        await S.saveCard(c.brand, c.last4, value);
        if (manual) {
          await S.addSiteRule(location.hostname, c.brand, c.last4);
          annotateTarget(target, c.brand, c.last4);
        }
        await refreshState();
        renderAll();
        showMsg(msg, `Alias for ${label(c.brand)}:${c.last4} saved`);
        setTimeout(closeDialog, 1200);
      } catch (err) {
        saveBtn.disabled = false;
        showMsg(msg, `Could not save: ${err.message}`, true);
      }
    }
    saveBtn.addEventListener('click', save);
    alias.addEventListener('keydown', (e) => e.key === 'Enter' && save());

    panel.append(
      h('button', { className: 'close', textContent: '×', title: 'Close', onclick: closeDialog }),
      title,
      ...(manual
        ? [h('div', { className: 'row' }, brandSelect, digits)]
        : []),
      h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), alias),
      msg,
      h('div', { className: 'actions' }, h('button', { textContent: 'Cancel', onclick: closeDialog }), saveBtn)
    );
    place(panel, null);
    (manual && !last4 ? digits : alias).focus();
  }

  function showMsg(el, text, error = false) {
    el.textContent = text;
    el.className = `msg${error ? ' error' : ''}`;
  }

  function annotateTarget(target, brand, last4) {
    if (!target?.isConnected) return;
    const re = standalone(last4);
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (re.test(n.nodeValue) && n.parentElement) return annotate(n.parentElement, brand, last4, true, n);
    }
    annotate(target, brand, last4, true);
  }

  // ---------- context menu ----------

  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.composedPath()[0];
      lastContextTarget = t?.nodeType === 1 ? t : t?.parentElement || null;
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'card-alias:add') return;
    const target = lastContextTarget?.isConnected ? lastContextTarget : null;
    const row = target ? findRow(target, digitsIn(target.textContent)) : null;
    const hints = row ? hintsOf(row) : { labels: '', brandHints: '' };
    const text = msg.selection || (row ? textOf(row) : '');
    const found = P.analyze(text, hints.labels, hints.brandHints, { requireContext: false });
    const fallback = [...digitsIn(text)].pop()?.slice(-4) || '';
    openAdd({
      brand: found[0]?.brand || P.brandOf(`${text} ${hints.labels}`) || P.brandOf(hints.brandHints) || 'card',
      last4: found[0]?.suffix || fallback,
      manual: true,
      target,
    });
  });

  // ---------- live updates ----------

  const pending = new Set();
  let timer = 0;

  function flush() {
    timer = 0;
    const nodes = [...pending];
    pending.clear();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      if (n.nodeType === Node.TEXT_NODE) n.parentElement && scan(n.parentElement);
      else if (n.nodeType === Node.ELEMENT_NODE && !n.hasAttribute(UI_ATTR)) scan(n);
    }
    renderAll();
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') pending.add(m.target);
      else for (const n of m.addedNodes) if (!(n.nodeType === 1 && n.hasAttribute(UI_ATTR))) pending.add(n);
    }
    if (pending.size && !timer) timer = setTimeout(flush, 150);
  });

  function observe(root) {
    observedRoots.add(root);
    adoptSheet(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    await refreshState();
    adoptSheet(document);
    if (S.siteKey(location.hostname) in changes) scan(document.documentElement);
    renderAll();
  });

  (async () => {
    document.documentElement.setAttribute('data-card-alias', 'active');
    await refreshState();
    observe(document);
    scan(document.documentElement);
  })();
})();
