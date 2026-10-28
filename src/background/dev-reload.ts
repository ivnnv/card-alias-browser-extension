/**
 * Dev builds only: `pnpm dev` rewrites build.json on every rebuild. Unpacked
 * extensions serve their files straight from disk, so a changed id means new code.
 */
export function watchForRebuilds(): void {
  let first: number | null = null;
  setInterval(async () => {
    try {
      const res = await fetch(chrome.runtime.getURL('build.json'), { cache: 'no-store' });
      const { id } = (await res.json()) as { id: number };
      if (first === null) first = id;
      else if (id !== first) chrome.runtime.reload();
    } catch {
      // Mid-rebuild the file can be missing or half written; the next tick retries.
    }
  }, 1000);
}
