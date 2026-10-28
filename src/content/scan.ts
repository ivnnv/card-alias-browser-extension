import { analyze, type Brand } from '../shared/patterns';
import { annotate, renderAll } from './badges';
import { digitsIn, findRow, hintsOf, standalone, textOf } from './dom';
import { adoptSheet } from './highlights';
import { state, UI_ATTR } from './state';

const SKIP =
  'script,style,noscript,textarea,input,select,option,template,[contenteditable=""],[contenteditable="true"]';

const observedRoots = new WeakSet<Node>();
const pending = new Set<Node>();
let timer = 0;

function handleTextNode(node: Text): void {
  const el = node.parentElement;
  if (!el || el.closest(SKIP) || el.closest(`[${UI_ATTR}]`) || el.isContentEditable) return;
  const own = digitsIn(node.data);
  if (!own.size) return;
  const row = findRow(el, own);
  const { labels, brandHints } = hintsOf(row);
  let hit: { suffix: string; brand: Brand; manual?: boolean } | undefined = analyze(
    textOf(row),
    labels,
    brandHints,
  ).find((m) => own.has(m.suffix));
  if (!hit) {
    const rule = state.siteRules.find((r) => standalone(r.last4).test(node.data));
    if (rule) hit = { suffix: rule.last4, brand: rule.brand, manual: true };
  }
  if (hit) annotate(el, hit.brand, hit.suffix, { manual: !!hit.manual, textNode: node, row });
}

/** Badges every card number under root, including inside open shadow roots. */
export function scan(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (/\d{4}/.test(n.data)) nodes.push(n);
  }
  nodes.forEach(handleTextNode);
  if (!('querySelectorAll' in root)) return;
  for (const host of (root as ParentNode).querySelectorAll('*')) {
    if (host.shadowRoot && !observedRoots.has(host.shadowRoot)) {
      observe(host.shadowRoot);
      scan(host.shadowRoot);
    }
  }
}

function flush(): void {
  timer = 0;
  const nodes = [...pending];
  pending.clear();
  for (const n of nodes) {
    if (!n.isConnected) continue;
    if (n instanceof Text) {
      if (n.parentElement) scan(n.parentElement);
    } else if (n instanceof Element && !n.hasAttribute(UI_ATTR)) {
      scan(n);
    }
  }
  renderAll();
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'characterData') pending.add(m.target);
    else for (const n of m.addedNodes) if (!(n instanceof Element && n.hasAttribute(UI_ATTR))) pending.add(n);
  }
  if (pending.size && !timer) timer = window.setTimeout(flush, 150);
});

export function observe(root: Document | ShadowRoot): void {
  observedRoots.add(root);
  adoptSheet(root);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
}
