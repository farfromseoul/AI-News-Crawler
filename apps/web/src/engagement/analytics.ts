export type Choice = 'granted' | 'denied';
export const consentKey = 'ai-signal-consent-v1';
export const consentLifetime = 180 * 86400000;
export function readChoice(storage: Pick<Storage, 'getItem'>, now = Date.now()): Choice | null {
  try {
    const value = JSON.parse(storage.getItem(consentKey) ?? 'null');
    return value?.version === 1 && ['granted', 'denied'].includes(value.choice) && Number.isFinite(value.at) && value.at <= now && now - value.at < consentLifetime ? value.choice : null;
  } catch { return null; }
}
export interface AnalyticsConfig { enabled: boolean; measurementId: string; origin: string }
export function canTrack(config: AnalyticsConfig, origin: string) {
  try { const url = new URL(origin); return config.enabled && /^G-[A-Z0-9]+$/.test(config.measurementId) && config.origin === origin && url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname); } catch { return false; }
}
export type AnalyticsEvent = 'article_open' | 'bookmark_change' | 'like_change' | 'feed_filter';
export type AnalyticsFields = { item_id?: string; source?: string; action?: 'added' | 'removed'; topic?: string };
export class Analytics {
  private loaded = false;
  private allowed = false;
  private lastPage = '';
  private path = '/';
  constructor(private config: AnalyticsConfig) {}
  private command(..._args: unknown[]) {
    const w = window as unknown as { dataLayer: unknown[] };
    w.dataLayer = w.dataLayer || [];
    // gtag's queue expects an Arguments object, not a nested array.
    w.dataLayer.push(arguments);
  }
  consent(choice: Choice | null) {
    this.allowed = choice === 'granted';
    const w = window as unknown as Record<string, unknown>;
    w[`ga-disable-${this.config.measurementId}`] = !this.allowed;
    if (!this.allowed) { this.lastPage = ''; return; }
    if (!canTrack(this.config, window.location.origin) || this.loaded) return;
    this.loaded = true;
    this.command('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    this.command('js', new Date());
    this.command('config', this.config.measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: 'none', cookie_expires: 180 * 86400, page_location: window.location.origin + '/', page_referrer: '', page_title: 'AI SIGNAL' });
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'origin';
    script.id = 'ai-signal-google-tag';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(this.config.measurementId);
    document.head.appendChild(script);
  }
  page(section: string) {
    const safe = ['ai', 'engineering', 'conferences', 'tool-radar'].includes(section) ? section : 'ai';
    this.path = '/' + safe;
    if (!this.allowed || !this.loaded || this.lastPage === safe) return;
    this.lastPage = safe;
    this.command('set', { page_location: window.location.origin + this.path, page_referrer: '', page_title: 'AI SIGNAL · ' + safe });
    this.command('event', 'page_view', { page_location: window.location.origin + this.path, page_referrer: '', page_title: 'AI SIGNAL · ' + safe });
  }
  event(name: AnalyticsEvent, fields: AnalyticsFields) {
    if (!this.allowed || !this.loaded || !['article_open', 'bookmark_change', 'like_change', 'feed_filter'].includes(name)) return;
    const safe: Record<string, string> = {};
    // Only internal machine IDs; never pass arbitrary search text or URLs.
    for (const key of ['item_id', 'source', 'action', 'topic'] as const) {
      const value = fields[key];
      if (value && /^[a-zA-Z0-9_-]{1,160}$/.test(value)) safe[key] = value;
    }
    this.command('event', name, { ...safe, page_location: window.location.origin + this.path, page_referrer: '', page_title: 'AI SIGNAL' });
  }
  revoke() {
    this.consent('denied');
    // Cookies configured as host-only. Never clear functional visitor/bookmark state.
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (name === '_ga' || name.startsWith('_ga_')) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
    return this.loaded;
  }
}
