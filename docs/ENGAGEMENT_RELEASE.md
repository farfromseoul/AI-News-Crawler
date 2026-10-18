# Today·좋아요 배포

2026-10-18 사용자 승인: 이번 기능과 DB/Worker 설정만 배포. GA4는 추후 활성화한다.

## 범위
- 원격 main 기준 분리 브랜치 `feature/engagement-release`.
- Today: 한국시간 기준 분석 동의한 브라우저 수. 실제 사람 수와 다를 수 있다.
- 비로그인 좋아요/취소, 동의·거절·철회. 거절해도 좋아요 가능.
- 0005 migration으로 네 테이블 추가. 기존 뉴스 삭제 없음.
- Worker origin 및 요청 제한 바인딩 추가. GA4 빌드 플래그 false.
- AI 도구 리포트·페이지 관리·MCP 및 Collector 변경 제외.

## 검증
- 일회용 Node 컨테이너에서 타입 검사·Vitest 46개·빌드 통과.
- 실제 local D1 integration 포함. OpenAPI 10경로/11작업 검증.
- 브라우저/운영 검증은 후속 결과 기록 예정.

## 실행 절차
할 일 → 명령 → 확인
1. PR 검증 → GitHub Verify → 브라우저/스케줄 검사 성공 확인.
2. 배포 → 확정 브랜치의 Deploy Cloudflare 수동 실행 → D1/API/Collector 성공 확인.
3. 인수 → 운영 health/stats·좋아요/취소 → 뉴스 정상·DB 쓰기 확인.

GA4 활성화 시 설명과 동의 정책 버전을 갱신해 다시 동의를 받는다. 실제 Google 수신은 미확인/비활성이다.
방문 기록 정리는 ENGAGEMENT_INSTALL의 SQL을 운영자가 실행한다. 자동 정리 작업은 이번 범위에 없다.
오류 시 ENGAGEMENT_ENABLED=false로 기능을 닫고 기존 앱을 유지한다. 테이블 자동 삭제는 하지 않는다.

## 2026-10-18 운영 배포 완료

- 승인: Today·좋아요·동의 기능과 DB/Worker 설정 포함. GA4는 비활성.
- 코드 커밋: `fc5bade`, PR https://github.com/farfromseoul/AI-News-Crawler/pull/12 (열림, main 미병합).
- 배포: https://github.com/farfromseoul/AI-News-Crawler/actions/runs/39087647508 성공.
- 운영: https://ai-signal.negroism.workers.dev/
- D1 0005 migration 적용 성공. API 버전 `134f6210-3238-41a0-a663-a55b709b21bd`.
- CI: 타입·테스트46개·브라우저12개·빌드 성공.
- 운영 health/stats, 외부 Origin 차단, 동의 false 거부, 쿠키 재인식, 좋아요 저장·중복방지·취소 확인. 테스트 좋아요 취소 완료. 동의한 방문 등록은 운영에서 실행하지 않아 테스트 방문수는 추가하지 않음.
- 운영 Today 초기값0 정상. 브라우저 기준·분석 동의 사용자만 집계. GA4 실제 수신은 비활성/미확인.
- 기존 수집기 코드·시간표 변경 없음. 기존 workflow로 Collector도 재배포됨.
- 원본 작업 폴더 소스 보존. 분리 체크아웃: `/Users/allnewjh/projects/ai-signal-engagement-release`.
- 후속: PR 검토·main 병합, GA4 활성화 시 안내/동의 버전 갱신, 수동 보존기간 정리.
