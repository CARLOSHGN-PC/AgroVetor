const DEFAULT_TIMEOUT = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestWithResilience(url, options = {}, config = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    retries = 1,
    retryDelayMs = 700,
    cacheFallback = null,
    onRetry = null
  } = config;

  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Retry only for transient server errors.
      if (response.status >= 500 && attempt < retries) {
        attempt += 1;
        onRetry?.(attempt, response.status);
        await sleep(retryDelayMs * attempt);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      const canRetry = attempt < retries && (error?.name === 'AbortError' || !navigator.onLine || /network|timeout/i.test(error?.message || ''));
      if (canRetry) {
        attempt += 1;
        onRetry?.(attempt, error?.message || 'network');
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (typeof cacheFallback === 'function') {
        const fallbackResponse = await cacheFallback(error);
        if (fallbackResponse) return fallbackResponse;
      }

      throw error;
    }
  }

  throw new Error('requestWithResilience: retries exhausted');
}
