import type { NewsItem, Source } from '../../../packages/domain/types';

export type Sort = 'latest' | 'popular';
export type Kind = 'all' | 'tutorial' | 'official';
export function DiscoveryControls({
  source,
  sort,
  kind,
  onSort,
  onKind,
}: {
  source: Source;
  sort: Sort;
  kind: Kind;
  onSort: (s: Sort) => void;
  onKind: (k: Kind) => void;
}) {
  if (source !== 'youtube' && source !== 'x') return null;
  const youtube = source === 'youtube';
  return (
    <div className="discovery-controls">
      <div className="discovery-buttons" role="group" aria-label="소식 정렬">
        <button onClick={() => onSort('latest')} aria-pressed={sort === 'latest'}>
          최신
        </button>
        <button onClick={() => onSort('popular')} aria-pressed={sort === 'popular'}>
          {youtube ? '최근 인기' : '화제의 글'}
        </button>
      </div>
      <label className="discovery-kind">
        콘텐츠
        <select
          value={kind}
          onChange={(e) => onKind(e.target.value as Kind)}
          aria-label="콘텐츠 분류"
        >
          <option value="all">전체</option>
          {youtube ? (
            <option value="tutorial">튜토리얼</option>
          ) : (
            <option value="official">공식 계정</option>
          )}
        </select>
      </label>
      <p>
        {sort === 'popular'
          ? youtube
            ? '검색·수집한 최근 7일 영상의 조회수순 · 채널별 최대 3개'
            : '검색·수집한 최근 7일 게시물의 좋아요순 · 반응은 신뢰도와 달라요'
          : youtube
            ? '여러 채널에서 발견한 AI 영상 · 채널별 최대 3개'
            : 'AI 키워드로 발견한 발표와 논의'}
        {kind === 'tutorial'
          ? ' · 제목 표현에 따른 자동 분류'
          : kind === 'official'
            ? ' · 운영자가 확인·등록한 계정만 표시'
            : ''}
      </p>
    </div>
  );
}
function count(n: number) {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(
    n,
  );
}
export function ItemMetrics({ item }: { item: NewsItem }) {
  const metrics = item.metrics;
  return (
    <>
      {((metrics && Object.values(metrics).some((n) => n !== undefined)) ||
        item.durationSeconds !== undefined) && (
        <div
          className="item-metrics"
          title={
            item.metricsAt
              ? `지표 확인: ${new Date(item.metricsAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST`
              : undefined
          }
        >
          {item.durationSeconds !== undefined && (
            <span>
              {Math.floor(item.durationSeconds / 60)}:
              {String(item.durationSeconds % 60).padStart(2, '0')}
            </span>
          )}
          {metrics?.points !== undefined && <span>추천 점수 {count(metrics.points)}</span>}
          {metrics?.viewCount !== undefined && <span>조회 {count(metrics.viewCount)}</span>}
          {metrics?.likeCount !== undefined && <span>좋아요 {count(metrics.likeCount)}</span>}
          {metrics?.commentCount !== undefined && <span>댓글 {count(metrics.commentCount)}</span>}
          {metrics?.replyCount !== undefined && <span>답글 {count(metrics.replyCount)}</span>}
          {metrics?.repostCount !== undefined && <span>재게시 {count(metrics.repostCount)}</span>}
        </div>
      )}
      {item.contentKind === 'tutorial' && (
        <span className="classification-badge" title={item.classificationReason ?? undefined}>
          튜토리얼 · 자동 분류
        </span>
      )}
      {item.officialSource && (
        <span
          className="classification-badge"
          title="운영자가 확인하고 등록한 작성자 ID와 일치합니다. 게시물 내용의 검증을 의미하지 않습니다."
        >
          등록된 공식 계정
        </span>
      )}
    </>
  );
}
export function popularity(item: NewsItem) {
  return (item.source === 'youtube' ? item.metrics?.viewCount : item.metrics?.likeCount) ?? -1;
}
