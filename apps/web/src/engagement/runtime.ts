import { Analytics } from './analytics';
export const analytics = new Analytics({
  enabled: import.meta.env.VITE_GA_ENABLED === 'true',
  measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID ?? '',
  origin: import.meta.env.VITE_GA_ORIGIN ?? '',
});
export async function engagementRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/engagement' + path, {
    method, credentials: 'same-origin', signal,
    ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) } : {}),
  });
  if (!response.ok) throw Error(response.status === 429 ? '요청이 많아요. 잠시 후 다시 시도해 주세요.' : '지금은 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  return response.json();
}
let identityQueue: Promise<unknown> = Promise.resolve();
// Serializes cookie-creating requests within one tab, and across tabs where Web Locks exist.
export function withIdentity<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (navigator.locks) return await navigator.locks.request('ai-signal-identity', task);
    return await task();
  };
  const result = identityQueue.then(run, run);
  identityQueue = result.catch(() => {});
  return result;
}

export async function ensureIdentity() {
  const first = await engagementRequest<{ recognized: boolean }>('/identity', 'POST');
  if (first.recognized) return;
  const check = await engagementRequest<{ recognized: boolean }>('/identity', 'POST');
  if (!check.recognized) throw Error('브라우저 쿠키를 허용해야 방문 집계와 좋아요를 사용할 수 있어요.');
}
