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

1. `npx wrangler login` 후 `npx wrangler d1 create ai-sig`를 실행합니다.
2. 반환된 DB ID를 두 `wrangler*.jsonc`의 `database_id`에 동일하게 입력합니다. 현재 운영 DB는 ai-sig이며 preview_database_id는 기존 로컬 데이터 연결용입니다.
3. collector 설정의 검색 주제·YouTube 검색 상한·X 건수 상한·쿼리를 구성합니다. 비밀은 `npx wrangler secret put YOUTUBE_API_KEY --config wrangler.collector.jsonc` 및 `X_BEARER_TOKEN`으로 등록합니다.
4. GitHub `production` 환경에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 저장하고 `Deploy Cloudflare` 워크플로를 수동 실행합니다. 토큰에는 Worker 배포와 해당 D1 마이그레이션에 필요한 권한이 있어야 합니다.
5. API·정적 화면·Cron 실행과 소스 상태를 배포 환경에서 확인합니다. 첫 수집은 다음 09:00 KST 예약 시각에 시작합니다.

처음에는 GeekNews만 활성화해 배포 가능합니다. X/YouTube 공개 활성화 전에 계정의 이용 조건과 표시·보존·삭제 요구 사항을 확인해야 합니다. 삭제 동기화, 자동 운영 알림, 원격 즉시 실행은 후속 운영 작업입니다.

마이그레이션은 이전 코드와 호환되는 추가 방식으로 관리하세요. 앱 롤백은 이전 Worker 버전으로 수행하되 DB 마이그레이션을 자동 되돌리지 않습니다. 주요 변경 전 D1 백업/복구 지점을 확보하세요. 수집 실패 시 API는 기존 데이터를 계속 제공합니다. `/api/sources/status`와 `ingestion_runs`를 먼저 확인하고 인증·쿼터·외부 피드를 점검합니다.

## 구조

`apps/web`: 화면 · `workers/api`: 조회 · `workers/collector`: 정기 수집 · `packages/domain`: 계약/규칙 · `packages/sources`: 외부 연결 · `packages/storage`: D1 접근.

[설계도](ARCHITECTURE.md) · [디자인 기준](DESIGN_REFERENCE.md) · [협업 기록](Owner.md)

## Hacker News와 개별 수집

Hacker News는 인증 없이 공식 Firebase API의 최신·인기 글 목록을 합쳐 최대 30개 후보를 확인합니다(동시 요청 5개). AI 관련성 규칙으로 선별하고 추천 점수·댓글 수를 저장합니다. 제목 링크는 원문 URL을 우선하며, 원문 URL이 없거나 안전하지 않으면 Hacker News 게시글로 연결합니다. 외부 기사 본문은 수집하지 않습니다. 전체 검색·아카이브가 아니므로 범위 제한 시 partial을 표시합니다.

```sh
npm run collect -- --source youtube
npm run collect -- --source hackernews
```

0003_hackernews.sql은 기존 행을 복사한 뒤 소스 제약을 확장하며 기존 항목과 인덱스를 유지합니다. 먼저 npm run db:migrate를 실행하세요. X는 비용 때문에 현재 로컬 상한 0으로 보류 중입니다.

## 로컬 자동 수집

`npm run scheduler`는 한국 시간 매일 09:00에 로컬 수집기를 실행합니다. 웹 서버와 별도 프로세스이며 시작 직후에는 수집하지 않습니다. 종료는 실행 터미널에서 Ctrl+C. 로그는 `.cache/scheduler.log`, 중복 실행 방지 PID는 `.cache/scheduler.pid`에 기록합니다.

Mac이 켜져 있고 프로세스가 유지되어야 합니다. 잠자기 중 놓친 예약은 프로세스가 살아 있으면 깨어난 뒤 1회 실행합니다. 종료·재부팅 뒤에는 다시 실행해야 하며 과거 예약을 소급 실행하지 않습니다. 원격 상시 운영은 Cloudflare Cron 배포가 필요합니다. X 비활성 및 소스별 예산 한도는 동일하게 적용됩니다.

무료 Workers 외부 호출 한도 대응: HN 개별 조회 자동 재시도 없음, 모든 소스의 자동 리다이렉트 차단. 외부 호출은 실행당 최대 49회이며 CPU 사용량은 배포 후 관측이 필요합니다.


## 엔지니어링·컨퍼런스 피드

상위 메뉴에서 AI 뉴스 / 엔지니어링 / 컨퍼런스를 선택하고 출처·태그·행사·기간으로 좁힐 수 있습니다. 검색창은 제목 또는 태그명(예: `#Kubernetes`, `아키텍처`)을 지원합니다. 카드의 태그와 태그 순위도 클릭해서 필터링할 수 있습니다.

- `npm run db:migrate`: 0004 확장 스키마 적용(로컬)
- `npm run collect:engineering`: 추가된 RSS 8개 수집(로컬, API 키 불필요)
- `npm run db:reclassify`: 기존 로컬 글의 태그·행사 분류 갱신
- `GET /api/stats?section=engineering`: 동일 검색 조건 전체의 분야 비중·태그 순위

배포 시 기존 deploy workflow가 원격 마이그레이션을 먼저 실행합니다. 0004 적용 후 API와 collector를 함께 배포해야 합니다. RSS는 매일 한국시간 15:00~15:07에 한 출처씩 수집하며, 컨퍼런스 영상은 15:30에 기존 collector YouTube Secret과 일일 예산을 공유합니다. 기존 AI 수집 예약 14:30은 유지합니다.

차트는 수집된 검색 결과의 분포이며 시장 점유율이나 기술 우열이 아닙니다. 한 글의 대표 분야는 하나, 연관 태그는 여러 개입니다. 컨퍼런스 피드는 행사명을 언급하는 기사와 영상이며 공식 발표 여부를 보장하지 않습니다. 로그인·유료 콘텐츠는 접근을 우회하지 않고 공개 피드의 링크·요약만 제공합니다.


## 현재 자동 수집 시간표 (한국시간, 이전 임시 예약 대체)

| 출처 | 주기 | 시각 |
| --- | --- | --- |
| GeekNews | 매일 | 09:00 |
| Hacker News | 매일 | 10:00 |
| YouTube AI 검색 | 매일 | 11:00 |
| CNCF Blog | 매일 | 12:00 |
| The New Stack | 매일 | 13:00 |
| InfoQ | 매일 | 14:00 |
| AWS What's New | 화·금 | 15:00 |
| Kubernetes Blog | 화·금 | 16:00 |
| Cloudflare Blog | 화·금 | 17:00 |
| Martin Fowler | 일요일 | 18:00 |
| ByteByteGo | 일요일 | 19:00 |
| 컨퍼런스 영상 | 화·금 | 20:00 |
| X | 중단 | 실행하지 않음 |

각 예약은 출처 하나만 수집합니다. `schedule.json`을 로컬/운영에서 공유하고 Wrangler Cron 3개로 그룹화합니다. `npm run collect`와 `collect:engineering`은 사용자가 직접 실행하는 일괄 명령으로 유지하며 자동 스케줄러에서는 호출하지 않습니다.

컨퍼런스는 화요일 4개·금요일 3개 행사로 나눠 매주 7개를 검색합니다. 기본 설정에서 YouTube search 호출 예약은 매일 AI 8회 + 화요일 행사 8회/금요일 행사 6회로 주 70회(이전 매일 AI+행사 주112회 대비 37.5% 감소)입니다. 영상 상세 조회는 별도이며 일일 검색 상한16을 유지합니다. 시간 분산 자체는 전체 호출량을 줄이지 않으므로 빈도 축소와 예산 제한을 함께 적용합니다.

주 2회 피드는 98시간, 주 1회는 170시간이 지나야 지연으로 표시합니다. 로컬 스케줄러는 같은 시간표로 동작하고 절전으로 15분 넘게 지난 작업은 몰아서 실행하지 않습니다. 로컬과 운영을 둘 다 켜면 외부 API 사용량이 합산될 수 있으니 운영 배포 후 로컬 스케줄러는 필요할 때만 실행하세요. 운영 적용은 PR 병합·배포 이후입니다.


## MCP 확장 가이드

AI로 저장된 뉴스를 검색하고 브리핑하는 방법은 [MCP_GUIDE.md](./MCP_GUIDE.md)를 참고하세요. 로컬·Cloudflare 연결 방식과 제작 단계, 활용 예시를 정리한 설계 문서이며 MCP 서버는 아직 구현하지 않았습니다.

### 다음 개발 순서

1. [OpenAPI 명세·Swagger UI 구축 계획](./OPENAPI_SWAGGER_PLAN.md): 공통 계약 → 명세 → 문서 UI → API 검증.
2. [MCP 서버 구축 계획·아키텍처](./MCP_SERVER_PLAN.md): 공통 도구 → 로컬 stdio → AI 연결 → 인증된 원격 Worker.

두 문서는 구현 전 계획이며 현재 접속 가능한 Swagger/MCP 엔드포인트를 뜻하지 않습니다.

## OpenAPI 명세와 Swagger UI

로컬 구현 완료(2026-10-12). `npm run dev` 실행 후:

- Swagger UI: http://127.0.0.1:8787/api/docs (웹 개발 서버 5173에서도 `/api/docs` 가능)
- OpenAPI 3.1 JSON: http://127.0.0.1:8787/openapi.json
- 다섯 GET API의 검색 조건·응답·오류를 확인하고 Try it out으로 현재 서버에 요청할 수 있습니다.

명세는 공통 Zod 응답 스키마와 실제 라우트 정의에서 생성합니다. 응답 타입도 공통 스키마에서 추론합니다. 원본은 `packages/contracts/news.ts`, API 설명은 `workers/api/openapi.ts`입니다. 교차 필터 제약은 기존 querySchema 검증을 유지합니다.

Swagger UI의 JS/CSS는 고정 버전(5.30.3) CDN을 사용하므로 브라우저에서 CDN 접속이 필요합니다. 외부 명세 검증 서비스는 비활성화했습니다. `/openapi.json`은 UI 자산과 무관하게 동작하며 DB를 조회하지 않습니다. Try it out의 데이터 조회는 D1 사용량에 포함됩니다.

운영은 변경사항 병합 후 기존 API Worker 배포가 필요합니다. 배포 후 같은 경로로 접속하며, 이번 작업에서 운영 배포·DB 마이그레이션·Collector 스케줄 변경은 수행하지 않았습니다. MCP 서버는 다음 개발 단계입니다.
