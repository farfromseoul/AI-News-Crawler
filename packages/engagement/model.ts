export const DAY = 86_400_000;
export const CONSENT_VERSION = 1;
export function kstDay(now = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}
export async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
