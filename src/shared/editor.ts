import type { Brand } from './patterns.ts';

/**
 * The alias editor runs as an extension page in an iframe, so the visited page
 * never sees what is typed. These are the only messages it sends to the page's
 * content script, and none of them carries the alias.
 */
export const EDITOR_SOURCE = 'card-alias-editor';

export type EditorPayload =
  | { type: 'close' }
  | { type: 'resize'; height: number }
  | { type: 'saved'; brand: Brand; last4: string };

export type EditorMessage = EditorPayload & { source: typeof EDITOR_SOURCE };

export interface EditorParams {
  mode: 'add' | 'info';
  brand: Brand;
  last4: string;
  host: string;
  /** Opened from the context menu: brand and digits are editable and saved as a site rule. */
  manual: boolean;
  /** What the badge matched, which can differ from the saved card when one side is a generic "card". */
  shownBrand: Brand;
  shownLast4: string;
}

export function editorUrl(base: string, p: EditorParams): string {
  const query = new URLSearchParams({
    mode: p.mode,
    brand: p.brand,
    last4: p.last4,
    host: p.host,
    manual: p.manual ? '1' : '',
    shownBrand: p.shownBrand,
    shownLast4: p.shownLast4,
  });
  return `${base}?${query}`;
}

export function readEditorParams(search: string): EditorParams {
  const q = new URLSearchParams(search);
  const brand = (q.get('brand') ?? 'card') as Brand;
  const last4 = q.get('last4') ?? '';
  return {
    mode: q.get('mode') === 'info' ? 'info' : 'add',
    brand,
    last4,
    host: q.get('host') ?? '',
    manual: q.get('manual') === '1',
    shownBrand: (q.get('shownBrand') as Brand | null) ?? brand,
    shownLast4: q.get('shownLast4') ?? last4,
  };
}
