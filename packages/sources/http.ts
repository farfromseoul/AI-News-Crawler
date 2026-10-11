export class SourceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function request(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      if (attempt >= retries) throw new SourceError('network_error');
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (response.ok) return response;
    // workerd supports manual/follow only. Reject redirects without another subrequest.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new SourceError('redirect_blocked');
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= retries)
      throw new SourceError(
        response.status === 401 || response.status === 403
          ? 'auth_error'
          : response.status === 429
            ? 'rate_limited'
            : 'upstream_error',
      );
    const header = response.headers.get('retry-after');
    const delay = header
      ? /^\d+$/.test(header)
        ? Number(header) * 1000
        : Date.parse(header) - Date.now()
      : 500 * 2 ** attempt;
    if (delay > 10000) throw new SourceError('rate_limited');
    await response.body?.cancel();
    await new Promise((r) => setTimeout(r, Math.max(0, Number.isFinite(delay) ? delay : 1000)));
  }
}
