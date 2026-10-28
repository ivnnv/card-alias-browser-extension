<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="Card Alias logo" />
</p>

<h1 align="center">Card Alias</h1>

<p align="center">
  Name your saved cards. See the name wherever a checkout only shows <code>•••• 2071</code>.
</p>

<p align="center">
  <a href="#install"><img alt="Chrome Web Store: coming soon" src="https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-lightgrey?logo=googlechrome&logoColor=white" /></a>
  <a href="https://github.com/ivnnv/card-alias-browser-extension/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ivnnv/card-alias-browser-extension/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/ivnnv/card-alias-browser-extension/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/ivnnv/card-alias-browser-extension/actions/workflows/codeql.yml/badge.svg" /></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-3b82f6" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" />
</p>

---

Most payment pages list your saved cards as a brand and the last four digits, and almost none let you name them. Was 2071 the work card or the travel one?

Card Alias finds masked card numbers on any page and marks them, so one click shows the name you gave that card.

<!-- TODO: screenshot of the extension on a checkout page -->

## Features

- **Finds masked numbers in English and Spanish:** `Visa •••• 2071`, `**** 2071`, `card ending in 2071`, `x2071`, `tarjeta terminada en 2071`, `acabada en 2071`, `últimos 4 dígitos 2071` and more.
- **Marks the exact text:** a dotted highlight plus a small badge. `+` adds an alias, `i` shows it, with edit and delete.
- **Catches what it misses:** right-click any number and pick **Add card alias…**, and it remembers that number on that site.
- **Works where payment UIs live:** iframes, shadow DOM, late-loading lists and native modal dialogs.
- **Never gets in the way:** clicking a badge never selects the payment row under it, and the page's layout is never touched.
- **Syncs with your Chrome profile**, with JSON export and import on the settings page.
- **Your colors:** pick the highlight colors for cards with and without an alias.

## Privacy

Card Alias keeps everything in `chrome.storage.sync`:

- each card's brand, last four digits (five for Amex), your alias and when you saved it,
- the hostname of any site where you added a card by right-click,
- your highlight colors.

It never stores full card numbers, never reads form fields and makes no network requests of its own. Chrome sync carries the data between browsers signed in to your profile.

The alias editor runs as a separate extension frame, so the sites you visit can't read what you type into it or see the aliases you saved. An end-to-end test checks this against a hostile page that records every keystroke, message and DOM change.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](.github/SECURITY.md).

Every release zip is built by CI from a tagged commit, with a SHA-256 checksum and signed build provenance. To check that a zip came from this repository:

```sh
gh attestation verify card-alias-browser-extension-<version>-chrome.zip --repo ivnnv/card-alias-browser-extension
```

## Install

**Chrome Web Store:** coming soon.

**From source:**

```sh
bun install
bun run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `.output/chrome-mv3`.

## Development

You need [Bun](https://bun.sh) 1.4+. Nothing else.

```sh
bun install
bun dev
```

`bun dev` opens a separate Chrome profile with the extension loaded and reloads it on every change.

It starts on the test page, which has realistic checkout layouts plus decoys that must not be marked. Serve it in another terminal:

```sh
bun fixture
```

The page lives at http://127.0.0.1:8765/test/fixture.html. It shows whether the extension is running and has a light/dark switch.

### Scripts

| Script                    | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `bun dev`                 | Opens Chrome with the extension and reloads it on change |
| `bun run build`           | Production build into `.output/chrome-mv3`               |
| `bun zip`                 | Zip for the Chrome Web Store                             |
| `bun check`               | Typecheck, lint, format check, tests and build           |
| `bun test`                | Unit tests, no build step                                |
| `bun typecheck`           | Type checking with `tsrs`                                |
| `bun lint` / `bun format` | `oxlint` / `oxfmt`                                       |
| `bun fixture`             | Serves the test page on port 8765                        |

### Stack

[WXT](https://wxt.dev) on Vite 8 (Rolldown, built on Oxc) for the build, TypeScript in strict mode checked by [tsrs](https://github.com/oxc-project/tsrs), and [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs) for lint and formatting. No runtime dependencies.

### Layout

```
src/
  entrypoints/     content script, background worker and settings page
  content/         page scanning, highlights, badges and dialogs
  shared/          detection patterns, storage and messages
public/icons/      extension icons
test/              unit tests and the fixture page
wxt.config.ts      manifest; the version comes from package.json
```

## Limitations

- Cards are told apart by brand and last four digits. Two cards that share both get one alias.
- Text drawn on a canvas, or inside a closed shadow root, can't be read. Right-click works there only when the number is selectable.
- Detection is tuned for English and Spanish wording. Other languages work when the number is masked with dots or asterisks next to a brand name.

## Contributing

Issues and pull requests are welcome. A pattern your bank or checkout uses that isn't detected is the most useful thing to report: include the exact text around the number.

Run `bun check` before opening a pull request.

## License

[MIT](LICENSE) © Ivn Nv
