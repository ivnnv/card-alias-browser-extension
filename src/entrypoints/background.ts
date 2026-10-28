import { defineBackground } from 'wxt/utils/define-background';
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
});
