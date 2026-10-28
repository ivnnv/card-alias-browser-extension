import { type Brand, LABELS } from '../shared/patterns';
import { find } from '../shared/store';
import badgeCss from './badge.css?inline';
import { openAdd, openInfo } from './dialog';
import { digitsIn, findRow, isolate, rangeFor, standalone, textOf } from './dom';
import { HL, flash, unhighlight } from './highlights';
import { state, UI_ATTR } from './state';

interface Annotation {
  el: Element;
  host: HTMLElement;
  button: HTMLButtonElement;
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
  margin: '0 0 0 6px',
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
  shadow.append(style, button);

  const a: Annotation = { el, host, button, brand, last4, manual, range };
  button.addEventListener('click', (e) => {
    e.preventDefault();
    const card = find(state.cards, a.brand, a.last4);
    if (card) openInfo(card, host);
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
  a.button.title = card ? `Alias: ${card.alias}` : `Add alias for ${LABELS[a.brand]}:${a.last4}`;
  a.button.setAttribute('aria-label', a.button.title);
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
