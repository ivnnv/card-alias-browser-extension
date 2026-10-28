import { defineConfig } from 'wxt';

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };

// The version comes from package.json.
export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'Card Alias',
    description: 'Shows your own aliases next to masked card numbers like •••• 2071.',
    icons,
    permissions: ['storage', 'contextMenus'],
    action: { default_title: 'Card Alias: manage aliases', default_icon: { 16: icons[16], 32: icons[32] } },
    // The alias editor is framed into pages so they can't read what is typed.
    web_accessible_resources: [{ resources: ['editor.html'], matches: ['<all_urls>'] }],
  },
  webExt: {
    // `bun dev` opens a fresh Chrome profile on the test page (served by `bun fixture`).
    startUrls: ['http://127.0.0.1:8765/test/fixture.html'],
  },
});
