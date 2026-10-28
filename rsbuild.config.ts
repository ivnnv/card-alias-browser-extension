import { defineConfig, type RsbuildPlugin } from '@rsbuild/core';
import pkg from './package.json' with { type: 'json' };
import { manifest } from './src/manifest.ts';

// Writes manifest.json (version from package.json) and, in dev, a fresh build id
// that the background worker polls to reload itself.
const extensionFiles: RsbuildPlugin = {
  name: 'card-alias:extension-files',
  setup(api) {
    api.processAssets({ stage: 'additional' }, ({ compilation, sources }) => {
      const json = (value: unknown) => new sources.RawSource(`${JSON.stringify(value, null, 2)}\n`);
      compilation.emitAsset('manifest.json', json({ ...manifest, version: pkg.version }));
      if (compilation.options.mode === 'development') compilation.emitAsset('build.json', json({ id: Date.now() }));
    });
  },
};

export default defineConfig(({ envMode }) => ({
  plugins: [extensionFiles],
  source: {
    entry: {
      content: { import: './src/content/index.ts', html: false },
      background: { import: './src/background/index.ts', html: false },
      options: './src/options/index.ts',
    },
  },
  html: { template: './src/options/index.html' },
  output: {
    distPath: { root: 'dist', js: '', css: '' },
    filenameHash: false,
    legalComments: 'none',
    // MV3 forbids eval, so no eval-based source maps.
    sourceMap: { js: envMode === 'development' ? 'cheap-module-source-map' : false, css: false },
  },
  // Content scripts and service workers must be single files.
  splitChunks: false,
}));
