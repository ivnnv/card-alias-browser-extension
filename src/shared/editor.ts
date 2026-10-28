import type { Brand } from './patterns.ts';

/**
 * The alias editor runs as an extension page in an iframe, so the visited page
 * never sees what is typed. Each editor is a single-use session the background
 * worker mints for a content script; a page that frames editor.html by itself
 * gets no session and the editor renders nothing. The editor talks back over
 * extension messaging, which the page can't observe.
 */
export const EDITOR_SOURCE = 'card-alias-editor';
export const OPEN_EDITOR = 'card-alias:open-editor';
export const SESSION_TTL_MS = 10 * 60_000;

export type EditorPayload =
  | { type: 'close' }
  | { type: 'resize'; height: number }
  | { type: 'saved'; brand: Brand; last4: string };

export type EditorMessage = EditorPayload & { source: typeof EDITOR_SOURCE; token: string };

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

export interface OpenEditorMessage {
  type: typeof OPEN_EDITOR;
  params: EditorParams;
}

export interface EditorSession {
  params: EditorParams;
  tabId: number;
  frameId: number;
  expires: number;
}

export const sessionKey = (token: string) => `editor:${token}`;
