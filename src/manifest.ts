// The build fills in `version` from package.json.
export const manifest = {
  manifest_version: 3,
  name: 'Card Alias',
  description: 'Shows your own aliases next to masked card numbers like •••• 2071.',
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  permissions: ['storage', 'contextMenus'],
  background: { service_worker: 'background.js' },
  action: {
    default_title: 'Card Alias: manage aliases',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  options_ui: { page: 'options.html', open_in_tab: true },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      all_frames: true,
      match_about_blank: true,
      match_origin_as_fallback: true,
      run_at: 'document_idle',
      js: ['content.js'],
    },
  ],
};
