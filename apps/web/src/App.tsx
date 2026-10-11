import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  DiscoveryControls,
  ItemMetrics,
  popularity,
  type Sort,
  type Kind,
} from './DiscoveryControls';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Github,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  X as Close,
  Youtube,
} from 'lucide-react';
import {
  sourceLabels,
  sources,
  topicLabels,
  type FeedResponse,
  type NewsItem,
  type Source,
  type SourceStatus,
  type Topic,
} from '../../../packages/domain/types';

type Tab = 'all' | Source;
const tabs: { id: Tab; name: string }[] = [
  { id: 'all', name: '오늘의 AI' },
  ...sources.map((id) => ({ id, name: sourceLabels[id] })),
];
const bookmarkKey = 'ai-signal-bookmarks-v1';
function readBookmarks(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(bookmarkKey) ?? '[]');
    return Array.isArray(value)
      ? value.filter((s): s is string => typeof s === 'string').slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function formatDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat('ko-KR', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      }).format(new Date(date))
    : '첫 수집 대기';
}
function relative(date: string | null) {
  if (!date) return '발행 시각 미제공';
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 3600000));
  return hours < 1 ? '방금 전' : hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  return response.json();
}
function SourceIcon({ source }: { source: Source }) {
  return source === 'hackernews' ? (
    <span aria-hidden="true">Y</span>
  ) : source === 'youtube' ? (
    <Youtube size={15} aria-hidden="true" />
  ) : source === 'x' ? (
    <span className="x-symbol" aria-hidden="true">
      𝕏
    </span>
  ) : (
    <span className="gn-symbol" aria-hidden="true">
      g<span>n</span>
    </span>
  );
}
function stateText(s: SourceStatus) {
  if (s.status === 'not_configured') return '연결 준비 중';
  if (s.status === 'error') return '수집 오류';
  if (s.status === 'budget_exhausted') return '수집 한도 도달';
  if (s.stale) return '업데이트 지연';
  if (s.status === 'partial') return '일부 수집 완료';
  return s.status === 'ok' ? '업데이트 완료' : '첫 수집 대기';
}
function NewsCard({ item, saved, onSave }: { item: NewsItem; saved: boolean; onSave: () => void }) {
  return (
    <article className={`news-card source-${item.source}`}>
      {item.thumbnailUrl && (
        <img
          className="news-thumbnail"
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      )}
      <div className="card-top">
        <span className="source-label">
          <SourceIcon source={item.source} />
          {sourceLabels[item.source]}
        </span>
        <span className="card-date" title={formatDate(item.publishedAt)}>
          {relative(item.publishedAt)}
        </span>
      </div>
      <h3>
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.title}
          <ArrowUpRight className="title-arrow" size={17} />
        </a>
      </h3>
      <p className="card-excerpt">{item.excerpt || '원문에서 자세한 내용을 확인해 보세요.'}</p>
      <ItemMetrics item={item} />
      <div className="card-tags">
        {item.tags.slice(0, 2).map((t) => (
          <span key={t}>#{topicLabels[t]}</span>
        ))}
      </div>
      <div className="card-bottom">
        <span className="author">{item.author || sourceLabels[item.source]}</span>
        <button
          type="button"
          className={`save-button ${saved ? 'saved' : ''}`}
          aria-label={`${item.title} ${saved ? '북마크 해제' : '북마크 저장'}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
          <span>{saved ? '저장됨' : '저장'}</span>
        </button>
      </div>
    </article>
  );
}
function SignalArtwork() {
  return (
    <div className="signal-art" aria-hidden="true">
      <div className="art-grid" />
      <div className="orbital orbital-one" />
      <div className="orbital orbital-two" />
      <div className="orbital orbital-three" />
      <div className="planet">
        <span className="planet-shine" />
        <Activity size={51} strokeWidth={1.3} />
      </div>
      <span className="satellite satellite-one">✦</span>
      <span className="satellite satellite-two" />
      <span className="art-coordinate">37.56° N / 126.97° E</span>
      <span className="art-caption">CONNECTING THE SIGNALS</span>
    </div>
  );
}
export function App() {
  const [sort, setSort] = useState<Sort>('latest'),
    [kind, setKind] = useState<Kind>('all');
  const [tab, setTab] = useState<Tab>('all'),
    [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState('');
  const [topic, setTopic] = useState<Topic | ''>(''),
    [period, setPeriod] = useState('all'),
    [bookmarks, setBookmarks] = useState(readBookmarks);
  const [savedOnly, setSavedOnly] = useState(false),
    [items, setItems] = useState<NewsItem[]>([]),
    [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null),
    [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true),
    [loadingMore, setLoadingMore] = useState(false),
    [error, setError] = useState(''),
    [statusError, setStatusError] = useState(false);
  const [revision, setRevision] = useState(0),
    [notice, setNotice] = useState(''),
    [featured, setFeatured] = useState<NewsItem | null>(null);
  const requestId = useRef(0),
    loadController = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const handle = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const controller = new AbortController();
    getJson<{ sources: SourceStatus[] }>('/api/sources/status', controller.signal)
      .then((data) => {
        setStatuses(data.sources);
        setStatusError(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setStatusError(true);
      });
    getJson<FeedResponse>('/api/items?limit=1', controller.signal)
      .then((data) => setFeatured(data.items[0] ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, [revision]);
  const effectiveSort = tab === 'youtube' || tab === 'x' ? sort : 'latest';
  const effectiveKind =
    (tab === 'youtube' && kind === 'tutorial') || (tab === 'x' && kind === 'official')
      ? kind
      : 'all';
  const query = new URLSearchParams({
    limit: '18',
    sort: effectiveSort,
    kind: effectiveKind,
    period,
    ...(tab !== 'all' ? { source: tab } : {}),
    ...(topic ? { tag: topic } : {}),
    ...(debounced ? { q: debounced } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController(),
      id = ++requestId.current;
    loadController.current?.abort();
    setLoadingMore(false);
    setLoading(true);
    setError('');
    setItems([]);
    setNextCursor(null);
    async function load() {
      if (savedOnly) {
        const saved = await Promise.all(
          bookmarks.map(async (id) => {
            const r = await fetch(`/api/items/${encodeURIComponent(id)}`, {
              signal: controller.signal,
            });
            if (r.status === 404) return null;
            if (!r.ok) throw new Error('저장한 소식을 불러오지 못했어요.');
            return r.json() as Promise<NewsItem>;
          }),
        );
        const filtered = saved
          .filter((i): i is NewsItem => !!i)
          .filter(
            (i) =>
              (tab === 'all' || i.source === tab) &&
              (!topic || i.tags.includes(topic)) &&
              (effectiveKind !== 'tutorial' || i.contentKind === 'tutorial') &&
              (effectiveKind !== 'official' || i.officialSource) &&
              (effectiveSort !== 'popular' ||
                (popularity(i) >= 0 &&
                  i.publishedAt !== null &&
                  Date.parse(i.publishedAt) >= Date.now() - 7 * 86400000)) &&
              i.title.toLowerCase().includes(debounced.toLowerCase()) &&
              (period === 'all' ||
                Date.parse(i.sortAt) >= Date.now() - (period === '1d' ? 1 : 7) * 86400000),
          )
          .sort(
            (a, b) =>
              (effectiveSort === 'popular' ? popularity(b) - popularity(a) : 0) ||
              b.sortAt.localeCompare(a.sortAt),
          );
        if (id === requestId.current) {
          setItems(filtered);
          setTotal(filtered.length);
        }
      } else {
        const data = await getJson<FeedResponse>(`/api/items?${query}`, controller.signal);
        if (id === requestId.current) {
          setItems(data.items);
          setTotal(data.total);
          setNextCursor(data.nextCursor);
        }
      }
    }
    load()
      .catch((e) => {
        if (e.name !== 'AbortError' && id === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [query, savedOnly, revision, savedOnly ? bookmarks.join(',') : '']);
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current,
      controller = new AbortController();
    loadController.current = controller;
    setLoadingMore(true);
    try {
      const data = await getJson<FeedResponse>(
        `/api/items?${query}&cursor=${encodeURIComponent(nextCursor)}`,
        controller.signal,
      );
      if (id === requestId.current) {
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setNotice('추가 소식을 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }
  function toggleSave(id: string) {
    const next = bookmarks.includes(id)
      ? bookmarks.filter((x) => x !== id)
      : [id, ...bookmarks].slice(0, 100);
    setBookmarks(next);
    try {
      localStorage.setItem(bookmarkKey, JSON.stringify(next));
    } catch {
      setNotice('이 브라우저에서는 북마크를 유지할 수 없어요. 현재 탭에서만 저장돼요.');
    }
  }
  function changeTab(value: Tab) {
    setTab(value);
    setSort('latest');
    setKind('all');
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    changeTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }
  const latest =
    statuses
      .map((s) => s.lastSuccessAt)
      .filter((s): s is string => !!s)
      .sort()
      .at(-1) ?? null;
  const connected = statuses.filter((s) => s.lastSuccessAt && s.status !== 'not_configured').length;
  const selectedStatus = statuses.find((s) => s.source === tab);
  const resetFilters = () => {
    setSearch('');
    setTopic('');
    setPeriod('all');
    setSort('latest');
    setKind('all');
  };
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <a className="skip-link" href="#feed">
        뉴스로 바로 가기
      </a>
      <header className="topbar">
        <div className="shell nav">
          <a
            className="brand"
            href="#"
            aria-label="AI SIGNAL 홈"
            onClick={() => {
              setTab('all');
              setSavedOnly(false);
              resetFilters();
            }}
          >
            <span className="brand-mark">
              <Activity size={23} />
            </span>
            <span>
              AI<span className="brand-light">SIGNAL</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <span className="nav-edition">YOUR DAILY AI FREQUENCY</span>
          <div className="nav-actions">
            <a
              className="github-link"
              href="https://github.com/farfromseoul/AI-News-Crawler"
              aria-label="GitHub 저장소"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={19} />
            </a>
            <button
              className={`bookmark-nav ${savedOnly ? 'active' : ''}`}
              onClick={() => {
                setSavedOnly(!savedOnly);
                feedRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              aria-pressed={savedOnly}
            >
              <Bookmark size={16} />
              <span>저장한 소식</span>
              <b>{bookmarks.length}</b>
            </button>
          </div>
        </div>
      </header>
      <main className="shell">
        <section
          className={`hero ${tab !== 'all' || savedOnly ? 'hero-compact' : ''}`}
          aria-labelledby="hero-title"
        >
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> THE NEXT WAVE, EVERY DAY
            </div>
            <h1 id="hero-title">
              STAY AHEAD.
              <br />
              <span>STAY CURIOUS.</span>
            </h1>
            <p className="hero-description">
              빠르게 변하는 AI, 놓치고 싶지 않은 이야기.
              <br />
              세상의 새로운 신호를 한곳에서 발견하세요.
            </p>
            <a className="primary-button" href="#feed">
              오늘의 소식 탐색하기 <ArrowDown size={17} />
            </a>
            <div className="hero-meta">
              <span className="mini-avatar">
                <Radio size={14} />
              </span>
              <span>GeekNews · X · YouTube</span>
              <span className="meta-divider" />
              매일 09:00 KST
            </div>
          </div>
          <aside className="featured-card" aria-label="가장 최근 수집된 AI 소식">
            <SignalArtwork />
            <div className="featured-content">
              <div className="featured-eyebrow">
                <Sparkles size={13} /> LATEST SIGNAL <span>01 / TODAY</span>
              </div>
              {featured ? (
                <>
                  <h2>
                    <a href={featured.url} target="_blank" rel="noreferrer">
                      {featured.title}
                    </a>
                  </h2>
                  <div className="featured-footer">
                    <span>
                      <SourceIcon source={featured.source} />
                      {sourceLabels[featured.source]}
                      <span className="dot-separator">·</span>
                      {relative(featured.publishedAt)}
                    </span>
                    <a
                      href={featured.url}
                      target="_blank"
                      rel="noreferrer"
                      className="featured-open"
                      aria-label="최신 소식 원문 열기"
                    >
                      <ArrowUpRight size={20} />
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <h2>
                    다음 AI 신호를
                    <br />
                    기다리고 있어요.
                  </h2>
                  <div className="featured-footer">
                    <span>첫 소식이 도착하면 이곳에 표시돼요.</span>
                    <Radio size={20} />
                  </div>
                </>
              )}
            </div>
          </aside>
        </section>
        <section className="source-strip" aria-label="소스별 업데이트 상태">
          <div className="source-strip-title">
            <Radio size={16} />
            <span>수집 채널</span>
            <b>
              {connected}
              <span> / 3</span>
            </b>
          </div>
          {sources.map((source) => {
            const state = statuses.find((s) => s.source === source);
            return (
              <button
                key={source}
                className="channel"
                onClick={() => {
                  changeTab(source);
                  feedRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span className={`channel-icon source-${source}`}>
                  <SourceIcon source={source} />
                </span>
                <span className="channel-info">
                  <strong>{sourceLabels[source]}</strong>
                  <span>
                    {state ? stateText(state) : statusError ? '상태 확인 실패' : '상태 확인 중'}
                  </span>
                </span>
                <span
                  className={`channel-dot ${state?.status === 'ok' && !state.stale ? 'connected' : ''}`}
                />
              </button>
            );
          })}
        </section>
        <section className="feed-section" id="feed" ref={feedRef} aria-labelledby="feed-title">
          <div className="feed-heading">
            <div>
              <p className="section-eyebrow">LESS NOISE. MORE SIGNAL.</p>
              <h2 id="feed-title">
                {savedOnly ? '저장한 소식' : '오늘의 AI 피드'}
                <span className="heading-star">✳</span>
              </h2>
            </div>
            <button
              className="refresh-button"
              onClick={() => setRevision((n) => n + 1)}
              disabled={loading}
              aria-label="뉴스 목록 새로고침"
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
              <span>{latest ? `${formatDate(latest)} 갱신` : '업데이트 확인'}</span>
            </button>
          </div>
          <div className="feed-navigation">
            <div className="source-tabs" role="tablist" aria-label="뉴스 소스">
              {tabs.map((t, index) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls="news-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => changeTab(t.id)}
                  onKeyDown={(e) => tabKey(e, index)}
                  className={tab === t.id ? 'selected' : ''}
                >
                  {t.id === 'all' ? <Sparkles size={15} /> : <SourceIcon source={t.id} />}
                  <span>{t.name}</span>
                  {t.id === 'all' && <b>{statuses.reduce((n, s) => n + s.count, 0)}</b>}
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="관심 있는 AI 소식 검색"
                aria-label="뉴스 제목 검색"
              />
              <kbd>/</kbd>
            </label>
          </div>
          <div className="filter-row">
            <div className="topic-filters" aria-label="주제 필터">
              <button
                onClick={() => setTopic('')}
                aria-pressed={!topic}
                className={!topic ? 'active' : ''}
              >
                전체 주제
              </button>
              {Object.entries(topicLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTopic(key as Topic)}
                  aria-pressed={topic === key}
                  className={topic === key ? 'active' : ''}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="period-filter">
              <Clock3 size={13} />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label="뉴스 기간"
              >
                <option value="all">전체 기간</option>
                <option value="1d">최근 24시간</option>
                <option value="7d">최근 7일</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          {savedOnly && (
            <div className="saved-banner">
              <Bookmark size={15} />이 브라우저에 저장한 소식이에요.
              <button onClick={() => setSavedOnly(false)}>
                전체 피드로 돌아가기 <Close size={14} />
              </button>
            </div>
          )}
          {(tab === 'youtube' || tab === 'x') && (
            <DiscoveryControls
              source={tab}
              sort={effectiveSort}
              kind={effectiveKind}
              onSort={setSort}
              onKind={setKind}
            />
          )}
          {selectedStatus && selectedStatus.status !== 'ok' && (
            <div className="status-banner">
              <CircleAlert size={16} />
              <span>
                {selectedStatus.status === 'not_configured'
                  ? `${sourceLabels[selectedStatus.source]} 채널을 준비하고 있어요. 연결되면 이 탭에서 새 소식을 만나볼 수 있어요.`
                  : selectedStatus.status === 'partial'
                    ? '수집 한도 안에서 가져온 소식이에요. 일부 항목이 누락될 수 있어요.'
                    : selectedStatus.status === 'pending'
                      ? '아직 첫 소식이 도착하지 않았어요.'
                      : '업데이트가 지연되고 있어요. 이전에 수집한 소식은 계속 볼 수 있어요.'}
              </span>
            </div>
          )}
          {statusError && (
            <div className="status-banner">
              <CircleAlert size={16} />
              수집 상태를 확인하지 못했어요. 새로고침으로 다시 확인해 주세요.
            </div>
          )}
          <div className="results-meta">
            <span>
              {loading ? '신호를 불러오는 중…' : `${total}개의 ${savedOnly ? '저장한 ' : ''}소식`}
            </span>
            <span>
              {effectiveSort === 'popular'
                ? tab === 'youtube'
                  ? '조회수순'
                  : '좋아요순'
                : '최신순'}{' '}
              <ArrowDown size={11} />
            </span>
          </div>
          <div id="news-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading}>
            {loading ? (
              <div className="news-grid" aria-label="뉴스 로딩 중">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="news-card skeleton">
                    <span />
                    <strong />
                    <p />
                    <p />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="empty-state" role="alert">
                <CircleAlert size={28} />
                <h3>잠시 신호가 끊겼어요</h3>
                <p>{error}</p>
                <button className="ghost-button" onClick={() => setRevision((n) => n + 1)}>
                  다시 시도 <RefreshCw size={14} />
                </button>
              </div>
            ) : items.length ? (
              <div className="news-grid">
                {items.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    saved={bookmarks.includes(item.id)}
                    onSave={() => toggleSave(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Radio size={30} />
                <h3>
                  {search ||
                  topic ||
                  period !== 'all' ||
                  effectiveKind !== 'all' ||
                  effectiveSort !== 'latest'
                    ? '조건에 맞는 소식이 없어요'
                    : savedOnly
                      ? '다시 읽고 싶은 소식을 저장해 보세요'
                      : '아직 도착한 소식이 없어요'}
                </h3>
                <p>
                  {search ||
                  topic ||
                  period !== 'all' ||
                  effectiveKind !== 'all' ||
                  effectiveSort !== 'latest'
                    ? '검색어나 필터를 바꿔 새로운 신호를 찾아보세요.'
                    : savedOnly
                      ? '카드 아래의 북마크 버튼을 누르면 이곳에 모아볼 수 있어요.'
                      : '새로운 AI 소식이 수집되면 이곳에 표시돼요.'}
                </p>
                {(search ||
                  topic ||
                  period !== 'all' ||
                  effectiveKind !== 'all' ||
                  effectiveSort !== 'latest') && (
                  <button className="ghost-button" onClick={resetFilters}>
                    필터 초기화 <RefreshCw size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          {nextCursor && !loading && !error && (
            <div className="load-more">
              <button className="ghost-button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '불러오는 중…' : '더 많은 신호 발견하기'}
                <ArrowDown size={15} />
              </button>
            </div>
          )}
          {!loading && items.length > 0 && !nextCursor && (
            <p className="end-of-feed">
              <Check size={13} />
              지금까지 도착한 신호를 모두 확인했어요.
            </p>
          )}
        </section>
        <section className="closing-note">
          <span className="closing-icon">
            <Activity size={25} />
          </span>
          <div>
            <h2>내일의 변화, 오늘의 신호.</h2>
            <p>매일 새로운 AI 이야기를 모아 전해드려요.</p>
          </div>
          <a href="#feed" aria-label="뉴스 목록으로 이동">
            <ArrowUpRight size={24} />
          </a>
        </section>
      </main>
      <footer className="shell footer">
        <a className="brand footer-brand" href="#">
          <Activity size={20} />
          <span>
            AI SIGNAL<span className="brand-dot">.</span>
          </span>
        </a>
        <span>Curated by sources. Connected for you.</span>
        <a href="https://github.com/farfromseoul/AI-News-Crawler" target="_blank" rel="noreferrer">
          GitHub <ExternalLink size={12} />
        </a>
      </footer>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
