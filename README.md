# CornerBits · 해안 생활 화면 체험판

v0.7.0은 A안의 작은 해안 공간을 실제280×380 Windows 위젯에서 움직여 보는 프로토타입입니다. 집·나무·부두·작은 배가 하나의 컬러 픽셀 풍경에 놓이고, 바깥은 투명합니다.

- 부두를 누르면 인물이 걸어가 낚시하고 집 앞에 물고기를 겁니다.
- 해변을 누르면 나무를 주워옵니다.
- 집을 누르면 나무1개로 꽃화분→등불→벤치를 놓습니다.
- 물결·굴뚝 연기·걷기/행동이 움직이며 정지·안내·접기 중에는 진행도 멈춥니다. 모션 감소를 지원합니다.

이번은 화면과 반응을 확인하는 체험판입니다. **새 행동은 세션 내 임시 상태이며 닫았다 열면 초기화됩니다.** 기존 게임 기록은 바꾸지 않습니다. 영구 진행·경제·장기 분량은 이 화면 방향을 확인한 다음 설계합니다.

## 실행과 개발

기존 Node.js/Rust MSVC/Microsoft C++/Windows SDK/WebView2 환경을 사용합니다.

```powershell
npm ci
npm run tauri dev
```

브라우저: `npm run dev` 후 `http://127.0.0.1:1420/coast.html`.

```powershell
npm run tauri build -- --no-bundle
```

실행파일은 `src-tauri/target/release/cornerbits.exe`이며 기본 화면은 coast.html입니다. 이 PC의 최소 도구 환경에서는 먼저 `. .\.tools\native-env.ps1`을 실행합니다.

## 위젯 조작

위쪽 여백을 끌어 이동하고, 정지/재생·안내·접기·닫기를 사용합니다. 배경화면 위·다른 앱 뒤에 머물며 작업 표시줄/Alt+Tab에 일반 창으로 나타나지 않습니다. 트레이의 위젯 찾기/종료는 유지합니다. 접기는 창 크기만 바꾸고 기존 게임 설정 파일을 쓰지 않습니다.

## 기존 기록 보존

기존 index.html·게임 코드·schema7과 백업/복원 기능은 회귀 검증용으로 보존했습니다. 설치된 앱의 `%APPDATA%\dev.cornerbits.app\state.json` 및 snapshots를 새 프로토타입 실행/플레이로 덮어쓰거나 초기화하지 않습니다. native 시작과 새 화면은 읽기 전용 검사로 이전 형식도 메모리에서만 해석합니다. 기존 앱의 저장·이전·복원 경로는 유지합니다. 브라우저에서도 새 체험판은 기존 저장소를 읽거나 쓰지 않습니다.

이번 새 컨셉에는 이전 세 게임의60일 분량 모델을 적용하지 않습니다. 과거 결과는 [검증 기록](docs/verification.md)과 [이전 진행량 모델](docs/balance.md)에 남아 있습니다.

## 검증

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

기존 테스트는 index.html에서 보존된 앱을 확인하고, tests/coast.spec.ts는 새 화면의 행동 연결·저장 원본 무변경·정지/숨김/접기·실제 크기·모션 감소를 확인합니다. 자산 프롬프트/출처는 public/art/coast-prompts.json, 기획은 docs/superpowers/specs/2026-10-28-coastal-prototype.md에 있습니다. 공개 배포나 설치 프로그램은 구성하지 않았습니다.
