export async function waitForInteractiveResult<T>(
  resultPromise: Promise<T>,
): Promise<T> {
  // A pending Promise does not keep Node alive. Some Windows terminal hosts
  // leave stdin unreferenced after a raw-mode UI closes, so keep the event loop
  // active until the current interactive workflow genuinely settles.
  const keepAlive = setInterval(() => undefined, 60_000);
  try {
    return await resultPromise;
  } finally {
    clearInterval(keepAlive);
  }
}
