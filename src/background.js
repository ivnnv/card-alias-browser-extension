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
  chrome.tabs
    .sendMessage(tab.id, { type: 'card-alias:add', selection: info.selectionText || '' }, { frameId: info.frameId ?? 0 })
    .catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
