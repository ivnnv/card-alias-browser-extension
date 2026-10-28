import type { Colors } from '../shared/store.ts';

// Highlights paint the matched text without touching the page's DOM or layout.
export const HL = { new: new Highlight(), known: new Highlight(), flash: new Highlight() };
HL.flash.priority = 1;
CSS.highlights.set('card-alias-new', HL.new);
CSS.highlights.set('card-alias-known', HL.known);
CSS.highlights.set('card-alias-flash', HL.flash);

const sheet = new CSSStyleSheet();

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function applyHighlightColors({ newColor, knownColor }: Colors): void {
  sheet.replaceSync(`
    ::highlight(card-alias-new) { background-color: ${rgba(newColor, 0.2)}; text-decoration: underline dotted 2px ${newColor}; }
    ::highlight(card-alias-known) { background-color: ${rgba(knownColor, 0.2)}; text-decoration: underline dotted 2px ${knownColor}; }
    ::highlight(card-alias-flash) { background-color: ${rgba(newColor, 0.55)}; }`);
}

// A constructed sheet is not subject to the page's style-src CSP. Shadow roots need their own adoption.
export function adoptSheet(root: Document | ShadowRoot): void {
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

export function flash(range: Range): void {
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

export function unhighlight(range: Range): void {
  for (const highlight of Object.values(HL)) highlight.delete(range);
}
