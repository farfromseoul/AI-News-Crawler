import { useEffect, useState } from 'react';
import { topicLabels, type FeedStats, type Topic } from '../../../packages/domain/types';
const colors = [
  '#c3f765',
  '#9e8cff',
  '#5edcde',
  '#ffbd73',
  '#fa85b8',
  '#72a4ff',
  '#bfd3ca',
  '#d8cc83',
];
export function FeedInsights({
  query,
  revision,
  onTag,
}: {
  query: string;
  revision: number;
  onTag: (tag: Topic) => void;
}) {
  const [data, setData] = useState<FeedStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    fetch(`/api/stats?${query}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<FeedStats>;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [query, revision]);
  if (error)
    return (
      <div className="insights-message" role="status">
        분야 통계를 불러오지 못했어요. 목록 새로고침으로 다시 확인해 주세요.
      </div>
    );
  if (!data)
    return (
      <div className="insights-message" role="status">
        분야별 신호를 집계하고 있어요…
      </div>
    );
  if (!data.total)
    return (
      <div className="insights-message">
        조건에 맞는 소식이 모이면 분야 비중과 태그 순위를 보여드려요.
      </div>
    );
  const shown = data.topics.slice(0, 7);
  const other = data.topics.slice(7).reduce((n, t) => n + t.count, 0);
  const slices = [...shown, ...(other ? [{ tag: 'other', count: other }] : [])];
  let angle = 0;
  const gradient = slices
    .map((t, i) => {
      const start = angle;
      angle += (t.count / data.total) * 360;
      return `${colors[i]} ${start}deg ${angle}deg`;
    })
    .join(',');
  return (
    <section className="feed-insights" aria-label="분야별 수집 통계">
      <div className="insight-distribution">
        <div>
          <p className="section-eyebrow">SIGNAL MAP</p>
          <h3>어떤 분야가 모였을까?</h3>
          <p>현재 필터 전체 {data.total}건 · 대표 분야 기준</p>
        </div>
        <div className="distribution-body">
          <div
            className="donut"
            style={{ background: `conic-gradient(${gradient})` }}
            aria-hidden="true"
          >
            <div>
              <strong>{data.total}</strong>
              <span>소식</span>
            </div>
          </div>
          <ul>
            {slices.map((t, i) => (
              <li key={t.tag}>
                <i style={{ background: colors[i] }} />
                <span>{t.tag === 'other' ? '기타' : topicLabels[t.tag as Topic]}</span>
                <b>
                  {t.count}건 · {Math.round((t.count / data.total) * 100)}%
                </b>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="insight-ranking">
        <p className="section-eyebrow">TOP TOPICS</p>
        <h3>많이 다뤄진 태그</h3>
        <p>조회수 순위가 아닌 수집 건수 · 클릭해서 필터</p>
        <ol>
          {data.tags.slice(0, 5).map((t, i) => (
            <li key={t.tag}>
              <button onClick={() => onTag(t.tag)}>
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <span>{topicLabels[t.tag]}</span>
                <b>{t.count}건</b>
                <span
                  className="ranking-bar"
                  style={{ width: `${(t.count / data.total) * 100}%` }}
                />
              </button>
            </li>
          ))}
        </ol>
        <small>한 글에 여러 태그가 있어 태그 건수 합계는 전체보다 클 수 있어요.</small>
      </div>
    </section>
  );
}
