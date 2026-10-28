import { listenForContextMenu } from './context-menu';
import { renderAll } from './badges';
import { reloadWithExtension } from './dev-reload';
import { adoptSheet } from './highlights';
import { observe, scan } from './scan';
import { refresh } from './sync';
import { siteKey } from '../shared/store';

async function start(): Promise<void> {
  // Lets pages (the test fixture) see that the extension is running.
  document.documentElement.setAttribute('data-card-alias', 'active');
  listenForContextMenu();
  if (import.meta.env.DEV) reloadWithExtension();

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
}

void start();
