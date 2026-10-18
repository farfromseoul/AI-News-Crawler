# 방문·좋아요 구성 — 사용자가 적용

앱 코드는 구현 중. 이 문서의 설정·마이그레이션·배포 명령은 대상 환경 실행 **미확인**이다. 기존 설정 파일·마이그레이션은 수정하지 않았다.

## 1. DB 스키마

할 일: 아래 전체 SQL을 기존 `migrations`의 다음 빈 번호(현재 제안 `0005_engagement.sql`)로 사용자가 생성한다. 다음 번호를 다시 확인한다.

```sql
CREATE TABLE engagement_visitors (
  visitor_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE engagement_daily_visitors (
  day_kst TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY(day_kst,visitor_hash)
);
CREATE TABLE engagement_item_likes (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(item_id,visitor_hash)
);
CREATE TABLE engagement_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO engagement_metadata(key,value) VALUES ('tracking_started_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
```

명령(사용자, 미확인): `npm run db:migrate`로 기존 로컬 DB에 적용. 원격은 백업/대상 DB 확인 후 사용자가 `npx wrangler d1 migrations apply ai-sig --remote --config wrangler.jsonc` 실행.
확인: 네 테이블·메타데이터 생성. 기존 뉴스 건수 유지. 좋아요는 원출처 like_count와 별개.

## 2. Worker 설정

할 일: 기존 wrangler.jsonc의 vars에 `ENGAGEMENT_ENABLED` 문자열 `true`, `ENGAGEMENT_ORIGIN`에 실제 사이트 origin(경로/끝 슬래시 없음) 추가. 로컬은 프런트의 `http://127.0.0.1:5173` 사용 가능. 비밀 값이 아니다. 운영은 HTTPS 필수.

할 일: 같은 Worker에 아래 ratelimits 항목 병합. namespace_id는 기존 사용과 겹치지 않는 번호를 사용자가 선택한다. 아래 번호는 제안이다.

```json
"ratelimits": [
  {
    "name": "ENGAGEMENT_LIMITER",
    "namespace_id": "1005",
    "simple": { "limit": 120, "period": 60 }
  }
]
```

명령: 기존 사용자 배포 절차에 반영(미확인). 설정 없으면 API가 503으로 닫히고 뉴스는 유지된다.
확인: 동일 Origin 요청 허용, 외부 Origin 쓰기 차단, 한도 초과 429. Cloudflare CF-Connecting-IP를 일 단위 해시해 limiter 키로만 사용하고 DB/앱 로그에는 저장하지 않는다. Cloudflare rate limit은 위치별·근사 제한이며 전역 요금 상한이나 봇 완전 방지가 아니다. 공유 IP 사용자도 한도를 공유한다.
근거: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## 3. GA4 공개 빌드 설정

할 일: 프런트 빌드 환경에 다음 공개 변수 지정. 별도 서비스 계정 키/비밀 값 불필요.

| 이름 | 값 |
| --- | --- |
| VITE_GA_ENABLED | true |
| VITE_GA_MEASUREMENT_ID | 사용자의 실제 웹 스트림 측정 ID |
| VITE_GA_ORIGIN | 실제 운영 HTTPS origin |

Vite는 빌드 시 값을 넣는다. Worker 런타임 vars에만 넣어서는 프런트로 전달되지 않는다. 사용자 빌드/파이프라인 설정에서 지정한다. 개발·PR preview에는 비활성. 측정 ID 미설정이면 GA는 꺼지고 동의 UI/좋아요는 독립 동작한다.

명령: 사용자 최종 빌드·배포(미확인). GA 스트림의 확장 측정은 비활성으로 설정해야 수동 page_view·클릭과 중복되지 않는다.
확인: 첫 방문/거절 상태에서 Google 태그 네트워크 요청 없음. 허용 후 page_view 1개. 개인정보 설정에서 거절하면 재로드하여 이미 적재된 태그 타이머를 제거한다. 브라우저 저장 차단 시 현재 탭 선택만 유지한다. 이미 발송된 요청은 취소·삭제할 수 없다.

## 4. 보존과 운영

할 일: 일별 방문 90일, 만료 방문자 식별 기록 정리. 좋아요는 기사 삭제/명시 취소 시 제거하며 만료로 총수를 조용히 감소시키지 않는다. 만료된 브라우저는 예전 좋아요를 취소하지 못하므로 익명 방식의 한계로 안내한다.
명령(사용자, 미확인): 월 1회 점검 때 아래 SQL을 D1 콘솔/운영 절차로 실행. 자동 수집 Cron은 변경하지 않았다. 90일 보존은 다음 정리 시점까지 초과할 수 있으므로 정확한 90일 삭제가 필요하면 일별 정리를 사용자가 예약해야 한다.

```sql
DELETE FROM engagement_daily_visitors WHERE day_kst < date('now','+9 hours','-89 days');
DELETE FROM engagement_visitors WHERE expires_at <= unixepoch('now') * 1000;
```

확인: Today/최근 30일 값 유지, 오래된 활동 제거. 만료 방문자 좋아요는 익명 총수로 남는다. 좋아요용 쿠키는 180일, 선택은 브라우저 저장소에 정책 버전과 선택 시각 포함. 정책 변경 시 재동의 버전을 올린다. 쿠키 삭제·기기 변경·Web Locks 없는 환경의 최초 다중 탭 요청은 중복 브라우저 집계 가능.

## 5. 수동 인수 검사

1. 새 브라우저에서 동의 배너, 거절 후 뉴스·좋아요 사용.
2. 허용 후 Today 반영, 새로고침 중복 없음. GA4는 지연·차단기 차이로 수치 불일치 가능.
3. 좋아요 연타/취소/새로고침/다른 브라우저 확인. 실패 시 값 그대로·오류 안내.
4. 개인정보 설정에서 철회, 다음 페이지에서도 Google 요청 없음. 다른 탭에 철회 전달.
5. 설치 전에는 Today/좋아요를 0으로 꾸미지 않고 연결 대기로 표시.
