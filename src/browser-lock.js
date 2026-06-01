/** Serialize Puppeteer work so ApuCash + PaidCash do not run pages at once. */
let tail = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withBrowserLock(fn) {
  const run = tail.then(() => fn());
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
