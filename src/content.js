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
  }

  // ---------- reading the page ----------

  function textOf(root) {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement?.closest(`[${UI_ATTR}]`)) parts.push(n.nodeValue);
    }
    return P.normalize(parts.join(' '));
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
      if (rule) hit = { suffix: rule.last4, brand: rule.brand };
    }
    if (hit) annotate(el, hit.brand, hit.suffix, false, node);
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
      font: 700 12px/1 -apple-system, system-ui, sans-serif; color: #fff; background: #f59e0b;
      box-shadow: 0 0 0 2px rgba(0,0,0,.18); }
    button.known { background: #10b981; font: italic 700 12px/1 Georgia, serif; }
    button:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }`;

  function isolate(host) {
    for (const type of ISOLATED_EVENTS) host.addEventListener(type, (e) => e.stopPropagation());
  }

  // The badge goes right after the text node holding the digits, not at the end of el.
  function annotate(el, brand, last4, manual = false, textNode = null) {
    const prev = annotated.get(el);
    if (prev && prev.brand === brand && prev.last4 === last4 && prev.host.isConnected) return;
    prev?.host.remove();

    const host = document.createElement('card-alias-badge');
    host.setAttribute(UI_ATTR, 'badge');
    for (const [k, v] of [['display', 'inline-block'], ['vertical-align', 'middle'], ['margin', '0 0 0 6px'], ['line-height', '0'], ['position', 'relative']]) {
      host.style.setProperty(k, v, 'important');
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = BADGE_CSS;
    const button = document.createElement('button');
    button.type = 'button';
    shadow.append(style, button);

    const rec = { el, host, button, brand, last4, manual };
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const card = S.find(cards, rec.brand, rec.last4);
      if (card) openInfo(card, host);
      else openAdd({ brand: rec.brand, last4: rec.last4, anchor: host });
    });
    isolate(host);
    for (const type of ['click', 'mousedown', 'pointerdown']) host.addEventListener(type, (e) => e.preventDefault());

    el.classList.add('cardalias-target');
    if (textNode?.parentNode === el) textNode.after(host);
    else el.appendChild(host);
    annotated.set(el, rec);
    render(rec);
  }

  function unannotate(rec) {
    rec.host.remove();
    rec.el.classList.remove('cardalias-target', 'cardalias-known');
    annotated.delete(rec.el);
  }

  function render(rec) {
    const card = S.find(cards, rec.brand, rec.last4);
    rec.button.textContent = card ? 'i' : '+';
    rec.button.className = card ? 'known' : '';
    rec.button.title = card ? `Alias: ${card.alias}` : `Add alias for ${label(rec.brand)}:${rec.last4}`;
    rec.button.setAttribute('aria-label', rec.button.title);
    rec.el.classList.toggle('cardalias-known', !!card);
  }

  function renderAll() {
    for (const rec of [...annotated.values()]) {
      if (!rec.el.isConnected || !standalone(rec.last4).test(textOf(rec.el))) unannotate(rec);
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
    input:disabled { background: #f3f3f3; color: #111; -webkit-text-fill-color: #111; }
    button { font: inherit; padding: 6px 10px; border: 0; border-radius: 8px; cursor: pointer; background: #eee; color: inherit; }
    button.primary { background: #10b981; color: #fff; }
    .icon { padding: 6px 8px; }
    .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
    .msg { margin-top: 10px; font-size: 13px; color: #059669; }
    .msg.error { color: #dc2626; }
    .close { position: absolute; top: 8px; right: 8px; padding: 2px 8px; background: transparent; }
    @media (prefers-color-scheme: dark) {
      .panel { color: #eee; background: #1f1f22; }
      .row > span { color: #aaa; }
      input, select { border-color: #444; background: #2a2a2e; }
      input:disabled { background: #252528; color: #eee; -webkit-text-fill-color: #eee; }
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

    panel.append(
      h('button', { className: 'close', textContent: '×', title: 'Close', onclick: closeDialog }),
      h('h2', { textContent: `${label(card.brand)} •••• ${card.last4}` }),
      h('div', { className: 'row' }, h('span', { textContent: 'Alias:' }), input, edit),
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

  let targetSheet = null;

  // content.css only reaches the main document; shadow roots need their own copy.
  function adoptTargetCss(root) {
    if (!targetSheet) {
      targetSheet = new CSSStyleSheet();
      targetSheet.replaceSync(`
        .cardalias-target { outline: 2px dotted #f59e0b !important; outline-offset: 2px !important; animation: cardalias-flash 0.8s ease-in-out 3; }
        .cardalias-target.cardalias-known { outline-color: #10b981 !important; }
        @keyframes cardalias-flash { 50% { outline-color: transparent; } }`);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, targetSheet];
  }

  function observe(root) {
    observedRoots.add(root);
    if (root instanceof ShadowRoot) adoptTargetCss(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    await refreshState();
    if (S.siteKey(location.hostname) in changes) scan(document.documentElement);
    renderAll();
  });

  (async () => {
    await refreshState();
    observe(document);
    scan(document.documentElement);
  })();
})();
