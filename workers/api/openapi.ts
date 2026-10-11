import { createRoute, z } from '@hono/zod-openapi';
import { querySchema } from '../../packages/domain';
import {
  newsItemSchema,
  feedResponseSchema,
  feedStatsSchema,
  sourceResponseSchema,
  errorSchema,
} from '../../packages/contracts/news';

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const unavailable = json(errorSchema, 'DB 등 서비스 오류: service_unavailable');
const badQuery = json(
  errorSchema,
  '검색 조건 오류: invalid_query. 목록 커서 오류: invalid_cursor.',
);
const queryDescription =
  'period=all/1d/7d, limit 기본18·최대50. popular는 source=youtube 또는 x, tutorial은 youtube, official은 x에서만 허용. cursor는 동일 검색 조건에서만 재사용. 자료는 저장된 발췌문이며 실시간 전체 웹 검색이 아닙니다.';
export const routes = {
  health: createRoute({
    method: 'get',
    path: '/api/health',
    operationId: 'getHealth',
    tags: ['운영'],
    summary: 'API·DB 연결 확인',
    responses: { 200: json(z.object({ status: z.literal('ok') }), '연결 정상'), 503: unavailable },
  }),
  items: createRoute({
    method: 'get',
    path: '/api/items',
    operationId: 'listNews',
    tags: ['뉴스'],
    summary: '뉴스 검색',
    description: queryDescription,
    request: { query: querySchema },
    responses: {
      200: json(feedResponseSchema, '뉴스 목록과 전체 건수, 다음 커서'),
      400: badQuery,
      503: unavailable,
    },
  }),
  item: createRoute({
    method: 'get',
    path: '/api/items/{id}',
    operationId: 'getNews',
    tags: ['뉴스'],
    summary: '뉴스 상세',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: json(newsItemSchema, '저장된 뉴스'),
      404: json(errorSchema, 'not_found'),
      503: unavailable,
    },
  }),
  stats: createRoute({
    method: 'get',
    path: '/api/stats',
    operationId: 'getStats',
    tags: ['뉴스'],
    summary: '분야·태그 통계',
    description:
      queryDescription +
      ' cursor와 limit에 관계없이 필터 전체를 집계합니다. topics는 대표 분야, tags는 다중 태그 빈도이며 전체 업계 인기 순위가 아닙니다.',
    request: { query: querySchema },
    responses: {
      200: json(feedStatsSchema, '중복 제거·채널 다양성 적용 집계'),
      400: badQuery,
      503: unavailable,
    },
  }),
  status: createRoute({
    method: 'get',
    path: '/api/sources/status',
    operationId: 'getSourceStatus',
    tags: ['운영'],
    summary: '출처별 수집 상태',
    responses: {
      200: json(sourceResponseSchema, '마지막 시도·성공 시각과 지연 여부'),
      503: unavailable,
    },
  }),
};
export const documentConfig = {
  openapi: '3.1.0',
  info: {
    title: 'AI SIGNAL API',
    version: '1.0.0',
    description:
      '공개 읽기 API. 날짜는 저장된 ISO 시각이며 발행일이 없으면 null입니다. 수집은 별도 분산 스케줄로 수행됩니다.',
  },
  servers: [{ url: '/', description: '현재 서버' }],
};
