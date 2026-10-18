# 방문 지표·좋아요 확장 설계

2026-10-17 · 사용자 개발 시작 승인 후 앱 코드 구현. 설정·DB 적용·배포 미수행. 검증 범위/미완료는 [진행 현황](05-진행현황.md) 참조.

사용자 확정 요구: 사용자 분석에 Google Analytics 추가, 사이트 Today 표시, 기사 좋아요, 댓글 후속. 아래는 기본 설계이며 분석 동의와 표시 방식은 구현 전 확정한다. [GA4 구성 가이드](GA4_SETUP_GUIDE.md)를 함께 읽는다.

## 1. 기획서

뉴스 앱에 방문 지표와 기사 좋아요·취소를 추가한다. 댓글은 후속이다.

- 자체 Today: 한국시간 오늘 방문 등록한 고유 브라우저 수. GA4 DAU와 같은 지표로 표시하지 않는다.
- 자체 30일 방문: 오늘 포함 최근 30일 고유 브라우저 수. 일별 값 합산이 아니다. 1차 화면에는 Today만 표시하고 30일 값은 확장 가능하게 설계한다.
- GA4 DAU/MAU: GA4의 활성 사용자 정의로 각각 일/최근 30일 분석. 로그인 회원 수나 자체 Today와 같다고 보장하지 않는다.
- 활성: 뉴스 화면이 보이는 상태에서 방문 등록 성공. 수집기·MCP·단순 API 조회 제외.
- 메인 상단 Today 카드와 한국시간·브라우저 기준·집계 시작일·갱신 시각 안내. 분석 미동의 방문 제외 시 그 기준도 명시한다.
- 카드에는 AI SIGNAL 좋아요 수와 내 선택 표시. 원출처 좋아요와 구분.
- 쿠키 삭제·기기 변경은 별도 집계된다. 사람 수·동시 접속자·PV로 표현하지 않는다. 과거 접속 데이터는 복원 불가.

성공 기준: S1 같은 날 새로고침 중복 없음. S2 KST 자정/30일 경계와 DISTINCT 정확성. S3 동시·반복 좋아요/취소 중복·음수 없음. S4 새로고침 후 내 상태 유지 및 개인화 캐시 누출 없음. S5 없는 기사/외부 Origin/잘못된 입력 거부. S6 통신 실패 상태 복구와 뉴스 조회 유지.

## 2. 아키텍처

코드 확인: apps/web/src/App.tsx의 React 화면, workers/api/index.ts의 Hono API, packages/storage의 D1 저장소. 뉴스 목록은 public 60초 캐시. Keycloak 인증은 workers/page-manager/auth.ts의 별도 앱에 존재하며 뉴스 앱에는 연결되지 않았다.

기본안: 기존 Worker/D1 확장. 분석은 사용자 요청에 따라 GA4를 추가한다. 자체 공개 방문 집계와 좋아요는 기존 Worker/D1에 둔다. 신규 Worker는 제외한다. 로그인 도입을 전제하는 방식 대신 브라우저 기준을 먼저 제공한다. 이는 사용자 검토 전 제안이다.

### 식별·개인정보

서버가 발급한 충분히 긴 무작위 쿠키(HttpOnly/Secure/SameSite=Lax)를 사용하고 DB에는 해시와 만료일만 저장한다. 임의 식별자를 신뢰하지 않도록 발급 기록 확인. IP·User-Agent 지문은 사용하지 않는다. 해시만으로 완전 익명성이 보장되지는 않는다. 쿠키 제한 시 좋아요 제한 안내. 최초 다중 탭 발급 경쟁도 테스트한다.

쿠키 기본 수명 180일, 일별 활동 보존 90일 제안. 만료 방문자의 좋아요는 기사 삭제/명시 취소까지 총수에 남긴다. 만료 뒤 예전 좋아요 취소는 불가능한 익명 방식의 한계가 있다. 추적 기준·삭제 안내를 화면에 제공한다. 회원 단위 집계가 필요하면 별도 뉴스 인증 연동을 먼저 설계한다.

### 데이터 초안

| 테이블 | 키·목적 |
| --- | --- |
| engagement_visitors | visitor_hash PK, created_at, expires_at: 서버 발급 확인 |
| engagement_daily_visitors | (day_kst, visitor_hash) PK: 하루 한 행 |
| engagement_item_likes | (item_id, visitor_hash) PK, created_at: 중복 방지 |
| engagement_metadata | 집계 시작일·정의 버전 |

MAU는 30일 구간 DISTINCT visitor_hash. 좋아요는 item_id 인덱스로 집계해 증가 카운터 불일치를 피한다. 기사 삭제 정리 정책 필요. 기존 원출처 metrics를 덮어쓰지 않는다. DB 변경은 필요하며 실제 마이그레이션/적용은 아직 없다.

### API 계약 — 앱 코드 구현, 운영 미반영

- POST /api/engagement/visit: 식별자 발급/검증, 서버 KST 날짜로 중복 무시 삽입.
- GET /api/engagement/stats: dau, mau30d, asOf, timezone, trackingStartedAt. 공개 수치만 짧은 캐시.
- POST /api/engagement/items/state: 최대 50개 기사 ID의 count/liked 일괄 조회. private/no-store.
- PUT /api/engagement/items/:id/like 및 DELETE /api/engagement/items/:id/like: 설정/해제, 반복 요청 안전.

기존 public 뉴스 응답에 내 좋아요를 섞지 않는다. 쿠키 발급 응답도 no-store. 쓰기 요청의 동일 Origin, JSON 형식, ID·본문 크기를 검사하고 서버 발급/쓰기 빈도를 제한한다. Cloudflare 설정이 필요한 경우 사용자 적용안을 제공한다. UI 연타 잠금만으로 보안 한도라고 주장하지 않는다. 쿠키 삭제·다중 기기 악용은 완전 차단 불가.

### 비용

브라우저는 당일 등록 성공을 기억하고 서버는 복합 키로 중복 방지. 자정 뒤 페이지가 다시 보일 때 갱신, 상시 폴링 없음. 최근 30일 범위 조회와 통계 캐시 사용. 캐시가 모든 위치에 걸친 비용 상한을 보장하지 않는다. 활동 정리 실행 주체·주기는 구현 전에 확정하며 기존 수집 스케줄은 임의 수정하지 않는다.

D1은 읽기/쓰기 행·저장량 기준이고 인덱스 유지도 쓰기에 영향을 준다. 무료 보장은 하지 않는다. 근거: https://developers.cloudflare.com/d1/platform/pricing/ 및 https://developers.cloudflare.com/d1/observability/metrics-analytics/

## 3. 실행계획 초안

| 담당 | 할 일 → 명령 → 확인 |
| --- | --- |
| 사용자 | 지표·공개 표시·좋아요 범위 확정 → 명령 없음 → 설계 승인 |
| 에이전트 | 계약·저장소·API·화면·테스트 작성 → 앱 코드 수정 → S1~S6 테스트 준비 |
| 사용자 | SQL·필요 설정 반영 → 확정 후 정확한 명령 제공(미확인) → 로컬 DB 확인 |
| 에이전트 | 준비된 일회용 컨테이너 검증 → 환경 확인 후 명령 확정(미확인) → 날짜/경쟁/캐시/장애 검증 |
| 사용자 | 최종 빌드·운영 DB 적용·배포 → 확정 절차 제공(미확인) → 화면·D1 사용량 확인 |

현재 컨테이너 준비 여부 미확인. 기존 미커밋 작업이 많으므로 최소 범위 수정. 설치·설정·커밋·배포는 하지 않는다.

## 4. 향후 개선안

회원 집계와 익명 방문 분리, 관리자 추이 차트, 좋아요순 정렬, 댓글·신고·관리자 숨김. 댓글용 빈 테이블/메뉴는 지금 만들지 않는다.

## 5. GA4 연동 결정안

브라우저 → GA4: 분석에 동의한 경우에만 Google tag(gtag.js)를 로드하고 허용된 이벤트 전송.
브라우저 → 기존 API → D1: 동의한 브라우저 Today 집계, 별도의 좋아요 기능 저장.
관리자 → GA4 콘솔: 유입 채널·기기·활성 사용자·기사 반응 분석.

Google Tag Manager 대신 직접 태그 사용: 현재 한 앱·한 분석 제품이므로 코드 검토로 이벤트 계약을 관리한다. SDK 패키지 설치와 별도 GA 서버는 필요 없다. Measurement Protocol은 사용하지 않는다. GA Data API로 공개 숫자를 읽는 방식은 보고서 지연·조회 인증·쿼터·캐시 운영이 추가되어 1차에서 제외한다. 향후 GA 수치로 통일할 때는 Worker가 읽고 캐시하며 브라우저에 조회 자격 증명을 넣지 않는다.

GA4 태그는 보고서를 사이트에 자동으로 보여주지 않는다. 보고서는 처리에 24~48시간 걸릴 수 있고 Realtime은 최근 30분 범위다. Today와 DAU/MAU의 정의·수집 동의·차단기·처리 지연이 달라 서로 일치한다고 보장하지 않는다. 자체 Today는 실시간 동시 접속자가 아니다.

### 이벤트 계약

| 이벤트 | 시점·허용 값 |
| --- | --- |
| page_view | 최초 화면/주 메뉴 전환, 정규화한 가상 경로·고정 제목. 자동 page_view와 수동 전송을 중복 적용하지 않음 |
| feed_filter | 사용자 출처/태그 필터 변경, 허용 목록의 source/topic만 |
| article_open | 원문 클릭, 내부 item_id/source만. 이동을 기다리게 하지 않음 |
| bookmark_change | 실제 로컬 저장 성공, item_id와 added/removed |
| like_change | API에서 실제 상태 변경 성공했을 때만, item_id와 added/removed. 반복 PUT은 새 반응으로 세지 않음 |

자유 검색어, 기사 본문, 전체 외부 URL, 사용자 이름/이메일, 인증 정보, 자체 visitor ID는 전송하지 않는다. page_location/referrer에서 검색어·인증 쿼리를 제거하고 허용 경로만 전송한다. 자동 확장 측정은 초기에는 끄고 필요한 항목을 검증 후 켠다. 이벤트가 GA4에 한 번만 도착함을 보장하는 exactly-once 전송은 아니다. 좋아요 총수의 원장은 D1이다.

### 동의·환경 분리 기본안

분석 동의 전에는 GA 스크립트/이벤트 및 자체 방문 기록을 시작하지 않는 기본 방식을 사용한다. 거절해도 뉴스·좋아요 사용 가능. 좋아요용 기능 쿠키는 해당 기능 요청 때 발급하며 분석 식별자로 Google에 넘기지 않는다. 철회하면 후속 분석/방문 전송을 중지하고 앱 소유 분석 상태를 정리한다. 과거 Google 데이터 삭제와 같은 절차는 별도 안내한다. 광고 기능·Google Signals·User-ID는 1차 제외. 이 선택은 제품 기본안이며 법적 적합성 확정 주장이 아니다.

측정 ID는 공개 설정이지만 서비스 계정 키/API secret과 다르다. 이번 범위에 서비스 계정 키는 필요 없다. 운영 도메인 allowlist와 활성 플래그를 모두 만족해야 전송하며 localhost/PR preview는 기본 비활성. ID가 없어도 앱은 정상 동작한다. 별도 테스트 속성 또는 운영의 제한된 debug 검사로 검증한다.

추가 성공 기준: S7 동의 전/거절 후 GA 요청·자체 방문 쓰기 없음, 좋아요 가능. S8 StrictMode·재렌더에서 page_view 중복 없음. S9 개인정보·자유 검색어 전송 없음. S10 차단기/GA 오류 시 뉴스·좋아요 유지. S11 개발/preview 비활성. S12 Google DebugView/Realtime 수신은 사용자 실제 설정 후 확인.

공식 근거:
- https://developers.google.com/analytics/devguides/collection/ga4/web
- https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
- https://developers.google.com/tag-platform/security/concepts/consent-mode
- https://support.google.com/analytics/answer/11198161
- https://support.google.com/analytics/answer/12253918
- https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-basics

## 구현 반영

로그인 없이 브라우저 선택을 기억한다. 거절 시 GA·자체 방문 수집 없음, 좋아요 가능. POST /api/engagement/identity를 추가하여 기능 쿠키를 준비하고 재요청으로 저장 여부를 확인한다. 쿠키 불가 시 클라이언트 방문/좋아요 쓰기를 중지한다. 최초 다중 탭은 Web Locks가 있으면 직렬화하며 미지원 환경의 경쟁 한계가 있다.

구현 경로: apps/web/src/engagement, packages/engagement, packages/storage/engagement.ts, workers/api/engagement.ts. 앱 설정/스키마는 [사용자 적용안](ENGAGEMENT_INSTALL.md)에 전체 SQL과 설정 제안을 제공했다. API 플래그/limiter/DB가 준비되기 전은 연결 대기이며 뉴스는 유지된다.

운영은 Cloudflare, 로컬 개발·검증은 [OrbStack 가이드](LOCAL_CONTAINER_GUIDE.md)를 따른다. 마지막 보완 후 전체 TypeScript와 핵심 테스트 13개(통합 OpenAPI 유효성 포함) 재검증 통과. 전체 빌드·브라우저·실제 로컬 D1 검증은 최신 검증 결과에 반영했다. 운영 GA4 수신은 미확인.


## 최신 검증 결과 (2026-10-17)

사용자 로컬 설치 예외 승인 후 Linux 의존성/Chromium 준비, 타입 검사·Vitest 합계63개·뉴스/관리앱 검증 빌드·브라우저14개 시나리오 확인 완료. 별도 핵심 Node 검사13개도 앞선 실행 통과. 브라우저 통계/좋아요는 모의 API이며 실제 로컬 D1은 별도 통합2개 검증. GA4 운영 수신·Cloudflare limiter·운영 DB 적용/배포는 미확인. 최신 결과는 [진행 현황](05-진행현황.md)을 따른다.
