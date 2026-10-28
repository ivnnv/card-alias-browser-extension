import { PING } from '../shared/messages';

const LOCAL = /^(?:localhost|127\.0\.0\.1)$/;

/**
 * Dev builds only: keeps the service worker awake while a local page is open, and
 * reloads that page once the extension reloads itself after a rebuild.
 */
export function reloadWithExtension(): void {
  if (!LOCAL.test(location.hostname)) return;
  setInterval(() => {
    if (!chrome.runtime?.id) return location.reload();
    chrome.runtime.sendMessage({ type: PING }).catch(() => {
      if (!chrome.runtime?.id) location.reload();
    });
  }, 1000);
}
