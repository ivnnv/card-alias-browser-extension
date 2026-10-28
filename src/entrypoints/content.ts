import { defineContentScript } from 'wxt/utils/define-content-script';
import { renderAll } from '../content/badges.ts';
import { listenForContextMenu } from '../content/context-menu.ts';
import { adoptSheet } from '../content/highlights.ts';
import { observe, scan } from '../content/scan.ts';
import { refresh } from '../content/sync.ts';
import { siteKey } from '../shared/store.ts';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  async main() {
    // Lets pages (the test fixture) see that the extension is running.
    document.documentElement.setAttribute('data-card-alias', 'active');
    listenForContextMenu();

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'sync') return;
      await refresh();
      adoptSheet(document);
      if (siteKey(location.hostname) in changes) scan(document.documentElement);
      renderAll();
    });

    await refresh();
    observe(document);
    scan(document.documentElement);
  },
});
