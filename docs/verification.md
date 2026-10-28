# 1단계 검증 기록 · 2026-10-28

## 검증 범위

작은 Windows 창, 자동 저장, 백업 내보내기·복원 구현. 게임 콘텐츠와 배포는 이번 범위에서 제외했습니다.

## 실행 결과

- `npm run typecheck`: 통과.
- `npm test`: 44개 통과. 스키마·날짜·용량 검증, 백업 왕복, 저장 직렬화·실패·재시도, 종료 시 진행 중 작업 대기 포함.
- `npm run test:e2e`: 6개 통과. 새로고침 후 자동 저장 유지, 백업 다운로드·가져오기·복원 취소·복원 후 재실행, 손상 파일 거부, compact 모드, 최대 revision 및 저장 실패 복구 포함.
- `npm run build`: 통과. 프로덕션 프런트엔드 번들 생성.
- Impeccable detector: 문제 없음. 280×380 실제 렌더링 화면과 가로 넘침 확인.
- `cargo metadata --no-deps`: 통과. Cargo 설정·작업 경로 확인.
- `cargo fmt -- --check`: 통과. Rust 형식·구문 확인. Rust 타입체크·링크 검증을 대신하지 않습니다.
- 별도 코드 검토에서 종료·초기화 경합, 저장 번호 상한, 실패 후 재시도, 축소·최소화 위치와 대용량 손상 원본 복구를 보완했습니다.

## Windows 네이티브 검증 재개

사용자가 스마트 앱 컨트롤을 직접 해제한 후 `VerifiedAndReputablePolicyState=0`을 읽기 전용으로 확인했습니다. 빌드에 누락된 C++ 컴파일러는 Microsoft 공식 최소 패키지를 검증해 프로젝트의 gitignored `.tools/` 아래에 준비했습니다. 보안 설정을 자동 변경하지 않았습니다.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 19개 통과.
- `npm run check:native`: 전체 스크립트 통과. 라이브러리 19개 통과, 실행 진입점 0개, 문서 테스트 0개.
- `npm run tauri build -- --debug --no-bundle`: 통과. `custom-protocol`로 프런트엔드 파일을 내장한 Windows 실행 파일 생성.
- `npm run tauri build -- --no-bundle`: 통과. 정식 x64 Windows GUI 실행 파일 생성. PE 헤더의 subsystem=2를 직접 확인했으며 개발용 콘솔 창이 필요하지 않습니다.
- 생성된 개발용 실행 파일을 실제 실행했으며, CornerBits 프로세스와 제목이 있는 창의 존재를 확인했습니다.
- 실제 앱이 `%APPDATA%\dev.cornerbits.app\state.json`에 최초 상태를 저장한 것을 확인했습니다. 브라우저 저장소가 아닌 네이티브 저장 경로입니다.
- 사용자가 실제 앱에서 항상 위 표시 켜기 → 백업 내보내기 → 항상 위 표시 끄기 → 백업에서 복원 → 설정 다시 켜짐을 직접 확인하고 모두 정상이라고 답변했습니다.
- 터미널에서 실제 저장 파일의 항상 위 설정 `true`와 복원 전 스냅샷의 설정 `false`를 대조했습니다. 복원 전에 직전 상태가 별도로 보존됐습니다.
- 사용자가 기존 앱을 종료한 뒤 정식 실행 파일을 터미널에서 실행했습니다. 사용자는 재실행한 창의 항상 위 설정이 계속 켜져 있고 저장 완료로 표시된다고 확인했습니다.
- 사용자 요청으로 Computer Use 조작을 중단했습니다. 이후 화면 조작 검증은 사용자에게 요청하고, 빌드·파일 대조·자동 테스트는 터미널로 수행했습니다.

개발용 바이너리: `src-tauri/target/debug/cornerbits.exe`, 12,567,040 bytes. SHA256: `464EBC2F582B8272C3D9FED08FB5D6EEB53DC60B0C18F4BD53E5A06A314B9AA7`.

정식 바이너리: `src-tauri/target/release/cornerbits.exe`, 9,605,120 bytes. SHA256: `3032331D704E2F20D043906378A617E13492DFF55B9FA2E8380E1C747E1AD74C`. 정식 실행 파일도 `custom-protocol` 기능으로 화면 파일을 내장합니다.

최소 CRT 패키지의 공급업체 PDB 파일이 없어 링크 시 LNK4099 경고가 출력됐습니다. 테스트와 실행 파일 생성은 성공했습니다.

## 이전 빌드 환경 문제

사용자 승인으로 Rust 도구 체인을 설치했습니다. 표준 Visual Studio C++ 빌드 도구 설치는 디스크 공간 부족으로 실패했습니다. 최소 구성도 약 4.28GB를 요구했고, 설치 시점의 여유 공간은 약 3.7GB였습니다. 사용자 파일은 삭제하지 않았습니다.

대안으로 필요한 MSVC/Windows SDK 라이브러리와 리소스 컴파일러만 준비해 링커 동작을 확인했습니다. 그러나 `cargo test --manifest-path src-tauri/Cargo.toml`에서 Cargo가 생성한 의존성 빌드 스크립트 실행이 Windows 애플리케이션 제어 정책에 의해 차단됐습니다.

오류: `애플리케이션 제어 정책에서 이 파일을 차단했습니다. (os error 4551)`.

첫 구현 시점에는 이 오류로 네이티브 테스트와 실행 검증을 마치지 못했습니다. 이후 사용자의 정책 해제와 누락된 C++ 컴파일러 준비로 재개했으며, 현재 결과는 위에 기록했습니다.

현재 PC의 최소 도구 구성을 사용해 검증하려면 다음을 실행합니다. `.tools/`는 이 PC에만 준비한 폴더이며 Git에 포함하지 않습니다. 다른 PC에서는 README의 표준 개발 도구를 설치합니다.

```powershell
. .\.tools\native-env.ps1
npm run check:native
npm run tauri build -- --no-bundle
```

손상 원본 복구, 모니터 경계와 최소화 위치 계산은 네이티브 테스트로 확인했습니다. 실제 다중 모니터 이동, 화면 하단 막대 모드 재실행 및 트레이 조작은 별도 수동 확인 항목입니다.

검증 명령을 강제 종료한 경우는 없습니다. 각 실패 원인을 확인하고 필요한 환경을 보완한 다음 재실행했습니다.
