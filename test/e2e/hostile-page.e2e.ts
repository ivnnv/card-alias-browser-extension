import path from 'node:path';
import { type BrowserContext, chromium, expect, type Frame, type Page, test } from '@playwright/test';

const EXTENSION = path.resolve(import.meta.dirname, '../../.output/chrome-mv3');
const SHOP = 'http://hostile-shop.test/checkout';
const ALIAS = 'Top Secret Alias';

// A checkout page that tries every way a page script could learn what the user types.
const HOSTILE_PAGE = `<!doctype html>
<html><head><meta charset="utf-8" /></head><body>
  <ul><li><span>Visa Debit</span> <span>•••• 4242</span></li></ul>
  <input id="coupon" aria-label="Coupon" />
  <script>
    window.leaks = [];
    const log = (what) => window.leaks.push(String(what));
    for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'change', 'paste']) {
      window.addEventListener(type, (e) => log(type + ':' + (e.key ?? '') + (e.data ?? '') + (e.target?.value ?? '')), true);
    }
    window.addEventListener('message', (e) => log('message:' + JSON.stringify(e.data)), true);
    new MutationObserver((records) => {
      for (const r of records) {
        log(r.target.textContent);
        if (r.attributeName) log(r.target.getAttribute(r.attributeName));
        for (const n of r.addedNodes) log(n.textContent);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  </script>
</body></html>`;

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await context.route('http://hostile-shop.test/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: HOSTILE_PAGE }),
  );
});

test.afterAll(async () => {
  await context.close();
});

async function editorFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().includes('/editor.html'))).toBe(true);
  return page.frames().find((f) => f.url().includes('/editor.html'))!;
}

async function pageSaw(page: Page, secret: string): Promise<string[]> {
  return page.evaluate((s) => {
    const seen = [...(window as unknown as { leaks: string[] }).leaks, document.documentElement.outerHTML];
    return seen.filter((entry) => entry.includes(s) || entry.includes(s.slice(0, 3)));
  }, secret);
}

test('a hostile page cannot read an alias while it is typed, saved or shown', async () => {
  const page = await context.newPage();
  await page.goto(SHOP);
  const badge = page.locator('card-alias-badge');
  await expect(badge).toHaveCount(1);

  // Type the alias key by key, like a person would.
  await badge.click();
  const add = await editorFrame(page);
  await add.getByLabel('Alias').pressSequentially(ALIAS);
  await add.getByLabel('Alias').press('Enter');

  const [worker] = context.serviceWorkers();
  await expect
    .poll(() => worker!.evaluate(() => chrome.storage.sync.get('card:visa:4242')))
    .toMatchObject({ 'card:visa:4242': { alias: ALIAS } });

  // Open the saved alias again, which renders it on screen.
  await expect.poll(() => page.frames().some((f) => f.url().includes('/editor.html'))).toBe(false);
  await badge.click();
  const info = await editorFrame(page);
  await expect(info.getByLabel('Alias')).toHaveValue(ALIAS);

  expect(await pageSaw(page, ALIAS)).toEqual([]);
});

test('control: the same spy does catch text typed into the page itself', async () => {
  const page = await context.newPage();
  await page.goto(SHOP);
  await page.getByLabel('Coupon').pressSequentially(ALIAS);
  expect((await pageSaw(page, ALIAS)).length).toBeGreaterThan(0);
});
