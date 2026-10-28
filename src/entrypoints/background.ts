import { defineBackground } from 'wxt/utils/define-background';
import {
  type EditorSession,
  OPEN_EDITOR,
  type OpenEditorMessage,
  SESSION_TTL_MS,
  sessionKey,
} from '../shared/editor.ts';
import { ADD_ALIAS, type AddAliasMessage } from '../shared/messages.ts';

const MENU_ID = 'card-alias-add';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Add card alias…',
      contexts: ['selection', 'page', 'link', 'image', 'frame'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) return;
    const message: AddAliasMessage = { type: ADD_ALIAS, selection: info.selectionText ?? '' };
    chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 }).catch(() => {});
  });

  chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

  // Only content scripts can ask (no externally_connectable), so pages can't mint editor sessions.
  chrome.runtime.onMessage.addListener((msg: OpenEditorMessage, sender, sendResponse) => {
    if (msg?.type !== OPEN_EDITOR || sender.tab?.id === undefined) return;
    const token = crypto.randomUUID();
    const session: EditorSession = {
      params: msg.params,
      tabId: sender.tab.id,
      frameId: sender.frameId ?? 0,
      expires: Date.now() + SESSION_TTL_MS,
    };
    void chrome.storage.session.set({ [sessionKey(token)]: session }).then(() => sendResponse(token));
    return true;
  });
});
