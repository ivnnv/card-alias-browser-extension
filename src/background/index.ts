import { ADD_ALIAS, type AddAliasMessage, type Message, PING } from '../shared/messages';
import { watchForRebuilds } from './dev-reload';

const MENU_ID = 'card-alias-add';

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

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === PING) sendResponse(true);
});

if (import.meta.env.DEV) watchForRebuilds();
