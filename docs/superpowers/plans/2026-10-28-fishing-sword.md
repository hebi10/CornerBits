# 낚시·검 키우기 구현 계획

**목표:** 광산/회로를 낚시/검으로 교체해 정원과 함께3종 장식 게임으로 제공한다.

**구조:** 기존 Tauri/React/TypeScript, schema5와 legacy 데이터 보관, 생성 PNG atlas2개, 독립 엔진2개.

**스펙:** `docs/superpowers/specs/2026-10-28-fishing-sword.md`

- [x] 낚시 담당: fishing.ts/Fishing.tsx/fishing.css/fishing.test.ts의 고정 상태 계약과 수집/타이밍/UI
- [x] 검 담당: sword.ts/Sword.tsx/sword.css/sword.test.ts의 확률/보정/선택/UI와 여러 seed 진행 모델
- [x] 저장 담당: Rust game_state/storage의 schema5 strict 검증·v1~v4 이전·공통fixture
- [x] 메인: 새 PNG/Art,TS schema/App 통합,백업 안내·이전 기록 보존,모델·E2E·문서
- [x] 통합 검증/독립 리뷰/Windows 제품 빌드·실행/사용자 정상 동작 확인
- [x] 로컬 커밋으로 구현 보존; 이후 도트 스타일 변경 요청은 별도 작업으로 이어감

담당 파일은 겹치지 않게 유지한다. 이전 자산/엔진/원본 데이터는 삭제하지 않는다. 사용자 기록을 무단 수정하거나 프로세스를 강제 종료하지 않는다.
