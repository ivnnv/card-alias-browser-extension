import { type Brand, LABELS } from '../shared/patterns.ts';
import { find } from '../shared/store.ts';
import badgeCss from './badge.css?inline';
import { openAdd, openInfo } from './dialog.ts';
import { digitsIn, findRow, isolate, rangeFor, standalone, textOf } from './dom.ts';
import { HL, flash, unhighlight } from './highlights.ts';
import { state, UI_ATTR } from './state.ts';

interface Annotation {
  el: Element;
  host: HTMLElement;
  button: HTMLButtonElement;
  tip: HTMLSpanElement;
  brand: Brand;
  last4: string;
  /** Added by right-click; lives only as long as its site rule. */
  manual: boolean;
  range: Range;
}

const annotated = new Map<Element, Annotation>();
const HOST_STYLE: Record<string, string> = {
  display: 'inline-block',
  'vertical-align': 'middle',
  margin: '0 0 0 3px',
  'line-height': '0',
  position: 'relative',
};

export function paintColors(host: HTMLElement): void {
  host.style.setProperty('--ca-new', state.colors.newColor);
  host.style.setProperty('--ca-known', state.colors.knownColor);
}

export function paintAllBadges(): void {
  for (const a of annotated.values()) paintColors(a.host);
}

interface AnnotateOptions {
  manual?: boolean;
  /** Text node holding the digits; the badge goes right after it. */
  textNode?: Text;
  row?: Element;
}

export function annotate(
  el: Element,
  brand: Brand,
  last4: string,
  { manual = false, textNode, row }: AnnotateOptions = {},
): void {
  const prev = annotated.get(el);
  if (prev?.brand === brand && prev.last4 === last4 && prev.host.isConnected && !prev.range.collapsed) return;
  if (prev) unannotate(prev);

  let range: Range;
  if (textNode) {
    range = rangeFor(row ?? findRow(el, digitsIn(textNode.data)), textNode, last4);
  } else {
    range = document.createRange();
    range.selectNodeContents(el);
  }

  const host = document.createElement('card-alias-badge');
  host.setAttribute(UI_ATTR, 'badge');
  for (const [k, v] of Object.entries(HOST_STYLE)) host.style.setProperty(k, v, 'important');
  paintColors(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = badgeCss;
  const button = document.createElement('button');
  button.type = 'button';
  // Instant replacement for the slow native title tooltip. It lives in the closed
  // shadow root, so page scripts can't read the alias from it.
  const tip = document.createElement('span');
  tip.className = 'tip';
  // The button's aria-label already says it; this is the visual copy only.
  tip.setAttribute('aria-hidden', 'true');
  shadow.append(style, button, tip);
  const showTip = () => {
    const r = button.getBoundingClientRect();
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top - 6}px`;
    tip.classList.add('show');
  };
  const hideTip = () => tip.classList.remove('show');
  button.addEventListener('pointerenter', showTip);
  button.addEventListener('focus', showTip);
  for (const type of ['pointerleave', 'blur', 'click']) button.addEventListener(type, hideTip);

  const a: Annotation = { el, host, button, tip, brand, last4, manual, range };
  button.addEventListener('click', (e) => {
    e.preventDefault();
    const card = find(state.cards, a.brand, a.last4);
    if (card) openInfo(card, host, { brand: a.brand, last4: a.last4 });
    else openAdd({ brand: a.brand, last4: a.last4, anchor: host });
  });
  isolate(host);
  for (const type of ['click', 'mousedown', 'pointerdown']) host.addEventListener(type, (e) => e.preventDefault());

  if (textNode?.parentNode === el) textNode.after(host);
  else el.append(host);
  annotated.set(el, a);
  render(a);
  flash(range);
}

function unannotate(a: Annotation): void {
  a.host.remove();
  unhighlight(a.range);
  annotated.delete(a.el);
}

function render(a: Annotation): void {
  const card = find(state.cards, a.brand, a.last4);
  a.button.textContent = card ? 'i' : '+';
  a.button.className = card ? 'known' : '';
  // No native title: it is slow to appear and lives where the page can read it.
  a.tip.textContent = card ? card.alias : `Add alias for ${LABELS[a.brand]}:${a.last4}`;
  a.button.setAttribute('aria-label', card ? `Alias: ${card.alias}` : a.tip.textContent);
  HL[card ? 'known' : 'new'].add(a.range);
  HL[card ? 'new' : 'known'].delete(a.range);
}

/** Re-renders every badge, dropping the ones whose text or rule is gone. */
export function renderAll(): void {
  for (const a of annotated.values()) {
    const ruleGone = a.manual && !state.siteRules.some((r) => r.brand === a.brand && r.last4 === a.last4);
    const textGone = !a.el.isConnected || a.range.collapsed || !standalone(a.last4).test(textOf(a.el));
    if (ruleGone || textGone) unannotate(a);
    else render(a);
  }
}

export function annotateTarget(target: Element | null, brand: Brand, last4: string): void {
  if (!target?.isConnected) return;
  const re = standalone(last4);
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (re.test(n.data) && n.parentElement)
      return annotate(n.parentElement, brand, last4, { manual: true, textNode: n });
  }
  annotate(target, brand, last4, { manual: true });
}
