import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { consentKey, readChoice, type Choice } from './analytics';
import { analytics, engagementRequest, withIdentity, ensureIdentity } from './runtime';
import './engagement.css';
const ConsentContext = createContext<{ choice: Choice | null; open: () => void }>({ choice: null, open() {} });
function storedChoice() { try { return readChoice(localStorage); } catch { return null; } }
export function EngagementProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Choice | null>(storedChoice);
  const [show, setShow] = useState(choice === null);
  const [message, setMessage] = useState('');
  useEffect(() => { analytics.consent(choice); }, [choice]);
  useEffect(() => {
    const sync = () => { const next = storedChoice(); if (next === null) setShow(true); if (next !== 'granted') { const reload = analytics.revoke(); setChoice(next); if (reload) window.location.reload(); } else setChoice(next); };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('storage', sync); document.removeEventListener('visibilitychange', visible); };
  }, []);
  function choose(next: Choice) {
    let saved = true;
    try { localStorage.setItem(consentKey, JSON.stringify({ version: 1, choice: next, at: Date.now() })); } catch { saved = false; }
    const reload = next === 'denied' && analytics.revoke();
    analytics.consent(next);
    setChoice(next); setShow(false);
    setMessage(saved ? '' : '선택은 현재 탭에서만 유지돼요. 다음 방문에 다시 선택해 주세요.');
    // A loaded Google tag cannot be unloaded reliably. Reload after persisting rejection.
    if (reload) window.location.reload();
  }
  return <ConsentContext.Provider value={{ choice, open: () => setShow(true) }}>
    {children}
    {message && <p role="status" className="privacy-message">{message}</p>}
    {show && <section className="consent-banner" aria-labelledby="consent-title">
      <h2 id="consent-title">방문 분석을 허용할까요?</h2>
      <p>허용하면 오늘 방문 수에 이 브라우저를 포함해요. 현재 Google Analytics는 사용하지 않으며 Google로 분석 정보를 보내지 않아요. 선택은 이 브라우저에 180일간 저장돼요.</p>
      <p>거절해도 뉴스와 좋아요는 사용할 수 있어요. 로그인은 필요 없고, 하단 개인정보 설정에서 바꿀 수 있어요.</p>
      <details><summary>수집 항목과 보관 안내</summary><p>자체 분석에는 날짜와 무작위 브라우저 식별자의 해시를 사용해요. 이름·이메일·검색어·IP 주소는 방문 DB에 저장하지 않아요. 방문 기록 정리는 운영자가 수행하며 좋아요 식별 쿠키는 180일 유지해요. 좋아요는 취소하거나 기사가 삭제될 때 제거돼요. 동의 철회는 앞으로의 수집을 멈추며 과거 기록을 자동 삭제하지 않아요.</p><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 개인정보처리방침</a></details>
      <div className="consent-actions"><button onClick={() => choose('denied')}>거절</button><button onClick={() => choose('granted')}>분석 허용</button>{choice !== null && <button onClick={() => setShow(false)}>닫기</button>}</div>
    </section>}
  </ConsentContext.Provider>;
}
export function PrivacySettings() { const { open } = useContext(ConsentContext); return <button type="button" className="privacy-settings" onClick={open}>개인정보 설정</button>; }
type Stats = { today: number; visitors30d: number; day: string; asOf: string; trackingStartedAt: string | null };
let completedDay = '';
let visitInFlight: Promise<unknown> | null = null;
const dayNow = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export function VisitorSummary({ section }: { section: string }) {
  const { choice } = useContext(ConsentContext);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const choiceRef = useRef(choice); choiceRef.current = choice;
  useEffect(() => { analytics.consent(choice); analytics.page(section); }, [choice, section]);
  useEffect(() => {
    let live = true;
    const update = async () => {
      if (document.visibilityState === 'hidden') return;
      const day = dayNow();
      try {
        if (choiceRef.current === 'granted' && completedDay !== day) {
          if (!visitInFlight) visitInFlight = withIdentity(async () => {
            if (choiceRef.current !== 'granted') return;
            await ensureIdentity();
            if (choiceRef.current !== 'granted') return;
            const result = await engagementRequest<{ day: string }>('/visit', 'POST', { consent: true, version: 1 }); completedDay = result.day;
          }).finally(() => { visitInFlight = null; });
          await visitInFlight;
        }
        const result = await engagementRequest<Stats>('/stats?day=' + day);
        if (live) { setStats(result); setFailed(false); }
      } catch { if (live) { setStats(null); setFailed(true); } }
    };
    void update();
    const visible = () => { if (choiceRef.current === 'granted' && completedDay !== dayNow() || stats?.day !== dayNow()) void update(); };
    document.addEventListener('visibilitychange', visible);
    // Single timer at KST midnight, not continuous analytics polling.
    const midnight = Date.parse(dayNow() + 'T00:00:00+09:00') + 86400000;
    const timer = window.setTimeout(() => void update(), Math.max(1000, midnight - Date.now() + 500));
    return () => { live = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [choice, stats?.day]);
  return <aside className="visitor-summary" aria-label="오늘 방문 통계"><strong>Today <span>{stats ? stats.today.toLocaleString('ko-KR') : '—'}</span></strong><small>{failed ? '방문 집계 연결 대기' : '한국시간 · 분석에 동의한 브라우저 기준'}{stats && ` · ${new Date(stats.asOf).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} 집계`}</small>{stats?.trackingStartedAt && <small>집계 시작 {new Date(stats.trackingStartedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>}</aside>;
}
export type Reaction = { id: string; count: number; liked: boolean; changed?: boolean };
export function useReactions(ids: string[]) {
  const [states, setStates] = useState<Record<string, Reaction>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const busy = useRef(new Set<string>());
  const revision = useRef(0);
  const mutation = useRef<Record<string, number>>({});
  const key = ids.join(',');
  useEffect(() => {
    const controller = new AbortController(); const generation = ++revision.current; const snapshot = { ...mutation.current };
    const load = async () => {
      try {
        const rows: Reaction[] = [];
        for (let start = 0; start < ids.length; start += 50) {
          const result = await engagementRequest<{ items: Reaction[] }>('/items/state', 'POST', { ids: ids.slice(start, start + 50) }, controller.signal); rows.push(...result.items);
        }
        if (generation === revision.current) { setStates(previous => Object.fromEntries(rows.map(row => [row.id, (mutation.current[row.id] ?? 0) !== (snapshot[row.id] ?? 0) || busy.current.has(row.id) ? previous[row.id] ?? row : row]))); setError(''); }
      } catch { /* Missing schema/disabled feature must not block the feed. */ }
    };
    void load(); return () => controller.abort();
  }, [key]);
  async function toggle(id: string) {
    const current = states[id]; if (!current || busy.current.has(id)) return;
    busy.current.add(id); setPending(p => ({ ...p, [id]: true })); mutation.current[id] = (mutation.current[id] ?? 0) + 1;
    try {
      const result = await withIdentity(async () => { await ensureIdentity(); return engagementRequest<Reaction>('/items/' + encodeURIComponent(id) + '/like', current.liked ? 'DELETE' : 'PUT'); });
      setStates(p => ({ ...p, [id]: result })); setError('');
      if (result.changed) analytics.event('like_change', { item_id: id, action: result.liked ? 'added' : 'removed' });
    } catch (e) { setError(e instanceof Error ? e.message : '좋아요를 저장하지 못했어요.'); }
    finally { busy.current.delete(id); setPending(p => ({ ...p, [id]: false })); }
  }
  return { states, pending, error, toggle };
}
