# AI SIGNAL

GeekNews · YouTube · Hacker News · X의 AI 소식을 모으는 뉴스룸. React와 Cloudflare Workers/D1로 구성하며 수집기는 매일 09:00 KST 실행하도록 설정되어 있습니다.

## 로컬 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm ci
npm run build
npm run db:migrate
npm run collect
npm run dev
```

웹: http://127.0.0.1:5173 · API: http://127.0.0.1:8787

이 Mac에서 빠르게 다시 열려면 프로젝트 폴더의 `start.command`를 실행하세요. 로컬 DB 마이그레이션을 확인한 뒤 웹/API 서버를 시작합니다. 종료는 터미널에서 Ctrl+C입니다.

이 작업 환경에는 Node가 없어 공식 Node 22 바이너리를 `.tools/node-v22.23.3-darwin-arm64/`에 준비했습니다. 이 Mac에서는 먼저 아래를 실행하면 됩니다. 이 바이너리는 Git에 포함되지 않습니다.

```sh
export PATH="$PWD/.tools/node-v22.23.3-darwin-arm64/bin:$PATH"
```

`npm run dev`는 웹과 조회 API만 실행합니다. 로컬 데이터 갱신은 `npm run collect`로 수행합니다. 배포된 collector의 Cron이 예약 수집을 담당합니다. `npm run collect`는 로컬 D1에만 저장하며 원격 DB를 수정하지 않습니다.

네트워크가 없는 환경에서는 이미 받은 실제 Atom 파일을 가져올 수 있습니다.

```sh
npm run collect -- --geeknews-file /absolute/path/feed.xml
```

## 소스 연결

GeekNews는 인증 없이 공식 Atom 피드를 사용합니다. 제공된 제목·설명·발행 시각을 저장하며 링크는 GeekNews 토론 페이지입니다. 연결된 외부 기사 본문은 가져오지 않습니다.

`.dev.vars.example`을 `.dev.vars`로 복사하고 필요한 값만 로컬에 설정합니다. 키를 커밋하지 마세요.

| 설정 | 용도 |
| --- | --- |
| YOUTUBE_API_KEY | YouTube Data API 키 |
| YOUTUBE_QUERIES | 주제를 파이프 문자로 구분, 최대 4개. 기본: AI 에이전트, 생성형 AI, LLM, AI coding |
| YOUTUBE_DAILY_SEARCH_LIMIT | UTC 하루 검색 호출 예약 상한, 기본 16회 |
| X_BEARER_TOKEN | X 읽기 API 인증 |
| X_QUERY | 선택 사항. 기본 AI 키워드 검색, 재게시·답글 제외 |
| X_OFFICIAL_AUTHOR_IDS | 공식 계정 필터에 사용할 확인된 작성자 ID, 쉼표 구분 |
| X_DAILY_LIMIT | 하루 예약 가능한 게시물 읽기 건수, 0이면 비활성 |
| X_MONTHLY_LIMIT | 월 예약 가능한 게시물 읽기 건수, 0이면 비활성 |

X는 토큰과 일일·월간 읽기 상한이 준비되어야 호출합니다. 한 실행에 최대 100개, 최소 10개 단위로 읽기 예산을 먼저 예약합니다. 실패한 요청도 환불하지 않는 보수적인 집계입니다. 이 값은 **달러 예산이 아닌 게시물 수 상한**입니다. 실제 비용 상한은 X 콘솔에서도 설정해야 합니다. 과금되는 사용자 프로필 확장은 호출하지 않으며 작성자 ID를 표시합니다.

YouTube는 **API 키만 있으면 시작**하며 채널 ID는 필요 없습니다. 주제마다 최근 2일 최신순과 최근 7일 조회수순을 각각 최대 25개 검색하고 영상 ID를 중복 제거합니다. 기본 4개 주제는 실행당 검색 8회와 영상 상세 조회 최대 4회를 사용합니다. 검색 상한은 검색 요청만 집계하며 Google 프로젝트 쿼터와 별개입니다. 계획한 호출을 먼저 예약하고 실패 시에도 환불하지 않습니다.

X는 예약한 읽기 건수를 최신순·관련성순 검색에 나누어 사용합니다(20건 미만은 최신순만). 같은 게시물과 동일 작성자의 반복 링크를 제거합니다. 초기 최근 약 7일, 이후 48시간 겹침 구간을 검색합니다. 추가 페이지가 있으면 partial 상태를 기록하며 전체 수집을 보장하지 않습니다.

YouTube: 최신/최근 인기, 튜토리얼 필터. X: 최신/화제의 글, 공식 계정 필터. 인기는 **수집한 최근 7일 콘텐츠**의 조회수(YouTube)·좋아요(X) 순입니다. YouTube 피드는 채널별 최대 3개를 노출하며 저장한 북마크에는 이 상한을 적용하지 않습니다. 튜토리얼은 제목 표현으로 자동 분류하며 공식 계정은 등록한 ID만 해당합니다.

0002_discovery.sql은 발견 검색어, 작성자 ID, 조회수·반응 수, 지표 확인 시각, 영상 길이와 분류 근거를 추가합니다. 지표는 마지막 수집 값으로 갱신하며 상승률은 계산하지 않습니다. 기존 DB에서도 npm run db:migrate 후 사용하세요.

API 예: /api/items?source=youtube&sort=popular&kind=tutorial 또는 /api/items?source=x&kind=official. 인기순은 단일 플랫폼에서만 지원하며 커서는 같은 필터·정렬에서 사용해야 합니다.

## 구현 범위

- 반응형 다크 UI, 통합/소스 탭, 제목 검색, 주제·기간 필터, 페이지네이션, 로컬 북마크.
- 실제 Atom 파싱, AI 관련성 규칙, 안전한 URL/텍스트 정규화, 중복 방지 upsert.
- 소스별 실행 잠금·상태 기록, YouTube 검색/X 읽기 상한. 예약 요청은 자동 재시도하지 않습니다.
- 공개 조회 API와 별도 Cron Worker. 수집 실행용 공개 HTTP API 없음.
- AI 에이전트는 아직 사용하지 않습니다. `Enricher`와 `SourceAdapter` 계약으로 확장할 수 있습니다.
- 화면의 설명은 소스 제공 내용을 정리한 것이며 AI 생성 요약이 아닙니다.

첫 버전은 제목·설명만으로 관련성을 판단하므로 오탐/누락이 있을 수 있습니다. 최신순과 플랫폼별 인기순을 제공하며 사실 검증 결과를 제공하지 않습니다. 모든 소스가 미연결이면 실제 빈 상태를 표시합니다. 데모 데이터를 운영 피드에 삽입하지 않습니다.

## 검증

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Mac에 설치된 Chrome을 사용할 수도 있습니다.

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e
```

도메인 테스트와 실제 로컬 D1 통합 테스트를 실행합니다. 브라우저 테스트는 고정된 테스트 응답으로 탭·검색·북마크·오류·반응형을 검증하며 외부 API에 비용을 발생시키지 않습니다. 통합 테스트는 별도의 임시 D1을 사용합니다.

## Cloudflare 배포

1. `npx wrangler login` 후 `npx wrangler d1 create ai-news`를 실행합니다.
2. 반환된 DB ID를 두 `wrangler*.jsonc`의 `database_id`에 동일하게 입력합니다. 현재 ID는 로컬용 자리표시자입니다.
3. collector 설정의 검색 주제·YouTube 검색 상한·X 건수 상한·쿼리를 구성합니다. 비밀은 `npx wrangler secret put YOUTUBE_API_KEY --config wrangler.collector.jsonc` 및 `X_BEARER_TOKEN`으로 등록합니다.
4. GitHub `production` 환경에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 저장하고 `Deploy Cloudflare` 워크플로를 수동 실행합니다. 토큰에는 Worker 배포와 해당 D1 마이그레이션에 필요한 권한이 있어야 합니다.
5. API·정적 화면·Cron 실행과 소스 상태를 배포 환경에서 확인합니다. 첫 수집은 다음 09:00 KST 예약 시각에 시작합니다.

처음에는 GeekNews만 활성화해 배포 가능합니다. X/YouTube 공개 활성화 전에 계정의 이용 조건과 표시·보존·삭제 요구 사항을 확인해야 합니다. 삭제 동기화, 자동 운영 알림, 원격 즉시 실행은 후속 운영 작업입니다.

마이그레이션은 이전 코드와 호환되는 추가 방식으로 관리하세요. 앱 롤백은 이전 Worker 버전으로 수행하되 DB 마이그레이션을 자동 되돌리지 않습니다. 주요 변경 전 D1 백업/복구 지점을 확보하세요. 수집 실패 시 API는 기존 데이터를 계속 제공합니다. `/api/sources/status`와 `ingestion_runs`를 먼저 확인하고 인증·쿼터·외부 피드를 점검합니다.

## 구조

`apps/web`: 화면 · `workers/api`: 조회 · `workers/collector`: 정기 수집 · `packages/domain`: 계약/규칙 · `packages/sources`: 외부 연결 · `packages/storage`: D1 접근.

[설계도](ARCHITECTURE.md) · [디자인 기준](DESIGN_REFERENCE.md) · [협업 기록](Owner.md)

## Hacker News와 개별 수집

Hacker News는 인증 없이 공식 Firebase API의 최신·인기 글 목록을 합쳐 최대 100개 후보를 확인합니다(동시 요청 5개). AI 관련성 규칙으로 선별하고 추천 점수·댓글 수를 저장합니다. 제목 링크는 원문 URL을 우선하며, 원문 URL이 없거나 안전하지 않으면 Hacker News 게시글로 연결합니다. 외부 기사 본문은 수집하지 않습니다. 전체 검색·아카이브가 아니므로 범위 제한 시 partial을 표시합니다.

```sh
npm run collect -- --source youtube
npm run collect -- --source hackernews
```

0003_hackernews.sql은 기존 행을 복사한 뒤 소스 제약을 확장하며 기존 항목과 인덱스를 유지합니다. 먼저 npm run db:migrate를 실행하세요. X는 비용 때문에 현재 로컬 상한 0으로 보류 중입니다.

## 로컬 자동 수집

`npm run scheduler`는 한국 시간 매일 09:00에 로컬 수집기를 실행합니다. 웹 서버와 별도 프로세스이며 시작 직후에는 수집하지 않습니다. 종료는 실행 터미널에서 Ctrl+C. 로그는 `.cache/scheduler.log`, 중복 실행 방지 PID는 `.cache/scheduler.pid`에 기록합니다.

Mac이 켜져 있고 프로세스가 유지되어야 합니다. 잠자기 중 놓친 예약은 프로세스가 살아 있으면 깨어난 뒤 1회 실행합니다. 종료·재부팅 뒤에는 다시 실행해야 하며 과거 예약을 소급 실행하지 않습니다. 원격 상시 운영은 Cloudflare Cron 배포가 필요합니다. X 비활성 및 소스별 예산 한도는 동일하게 적용됩니다.
