import { locate, normalize } from '../shared/patterns';
import { UI_ATTR } from './state';

const ROW_MAX = 160;
const ROW_STOP =
  'li,tr,label,button,a,[role=option],[role=radio],[role=button],[role=menuitem],[role=menuitemradio],[role=listitem],[role=row]';
const ISOLATED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'touchstart',
  'touchend',
  'keydown',
  'keyup',
  'keypress',
] as const;

interface TextMap {
  text: string;
  nodes: { node: Text; start: number }[];
}

/** 4+ digit runs in text, ignoring dates like 08/28 or 12/2027. */
export const digitsIn = (text: string) => new Set(text.replace(/\d{1,2}\s*\/\s*\d{2,4}/g, '').match(/\d{4,}/g) ?? []);
export const standalone = (digits: string) => new RegExp(`(?<!\\d)${digits}(?!\\d)`);
const isYear = (digits: string) => /^(?:19|20)\d\d$/.test(digits);

// Text of root with each text node's offset, joined by spaces so separate
// elements never glue digits together ("7788" + "12 Oct" must not read "778812").
export function textMap(root: Node): TextMap {
  const map: TextMap = { text: '', nodes: [] };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.parentElement?.closest(`[${UI_ATTR}]`)) continue;
    if (map.text) map.text += ' ';
    map.nodes.push({ node: n, start: map.text.length });
    map.text += n.data;
  }
  return map;
}

export function textOf(root: Node): string {
  return normalize(textMap(root).text);
}

function pointAt(map: TextMap, index: number, isEnd: boolean): [Text, number] {
  const probe = isEnd ? index - 1 : index;
  let entry = map.nodes[0]!;
  for (const e of map.nodes) {
    if (e.start > probe) break;
    entry = e;
  }
  return [entry.node, Math.min(Math.max(index - entry.start, 0), entry.node.data.length)];
}

/** The exact matched phrase inside row, ending in node; just the digits when nothing wider matches. */
export function rangeFor(row: Element, node: Text, suffix: string): Range {
  const range = document.createRange();
  const map = textMap(row);
  const own = map.nodes.find((e) => e.node === node);
  if (own) {
    const nodeEnd = own.start + node.data.length;
    const span = locate(map.text, suffix).find((s) => s.end > own.start && s.end <= nodeEnd);
    if (span) {
      range.setStart(...pointAt(map, span.start, false));
      range.setEnd(...pointAt(map, span.end, true));
      return range;
    }
  }
  const at = Math.max(node.data.search(standalone(suffix)), 0);
  range.setStart(node, at);
  range.setEnd(node, Math.min(at + suffix.length, node.data.length));
  return range;
}

/**
 * Smallest ancestor that still looks like one payment row: stops at list items,
 * buttons and options, at ~160 chars, or where another card number appears.
 */
export function findRow(el: Element, ownDigits: Set<string>): Element {
  let row = el;
  for (let i = 0; i < 6 && !row.matches(ROW_STOP); i++) {
    const parent = row.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    if ((parent.textContent ?? '').length > ROW_MAX) break;
    if ([...digitsIn(textOf(parent))].some((d) => !ownDigits.has(d) && !isYear(d))) break;
    row = parent;
  }
  return row;
}

const joinHints = (list: (string | null | undefined)[]) => list.filter(Boolean).join(' ').replace(/[-_.]/g, ' ');

/** Text a row exposes outside its visible text: accessible labels, plus class and file names for brands. */
export function hintsOf(row: Element): { labels: string; brandHints: string } {
  const labels: (string | null | undefined)[] = [];
  const brandHints: (string | null | undefined)[] = [];
  const els = [row, ...row.querySelectorAll('img,svg,[aria-label],[title],[alt],[class],[src]')].slice(0, 40);
  for (const e of els) {
    if (e.closest(`[${UI_ATTR}]`)) continue;
    labels.push(e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('title'));
    if (e.localName === 'svg') labels.push(e.querySelector('title')?.textContent);
    brandHints.push(e.getAttribute('class'), e.getAttribute('src')?.split('/').pop());
  }
  return { labels: joinHints(labels), brandHints: joinHints(brandHints) };
}

/** Stops our UI's events from reaching page handlers (row selection, click-outside closers). */
export function isolate(host: Element): void {
  for (const type of ISOLATED_EVENTS) host.addEventListener(type, (e) => e.stopPropagation());
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}
