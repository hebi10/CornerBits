# 바탕화면 위젯 전환

해비님은 달력 위젯 이미지를 제시하며 독립 Windows 창 대신 바탕화면의 일부를 차지하는 형태를 요청했다. 선택 확인 결과: 배경화면 위에 붙고 다른 프로그램을 열면 그 뒤로 가려지는 바탕화면 위젯. 화면 작업 영역을 예약하는 appbar 방식은 사용하지 않는다.

기존 두 게임과 저장/백업 구조를 유지한다. 280×380 크기, 드래그 위치 저장,36px 축소,트레이·종료 저장을 유지하되 작업 표시줄/Alt+Tab의 일반 창 표시와 최소화 UI를 제거한다. 다른 창 위 고정 설정은 더 이상 사용하지 않는다. 이전 settings.alwaysOnTop 값은 백업 호환을 위해 데이터에 보존하되 위젯 배치에는 반영하지 않는다. 따라서 게임 데이터 형식은 변경하지 않는다.

기존 흑백 시스템을 유지하고 위젯 바탕에만 약한 투명도를 준다. 게임 칸과 텍스트는 읽을 수 있게 유지한다. 그림자/장식/애니메이션/새 라이브러리 없음.

Windows 구현은 일반 앱보다 아래/바탕화면보다 위의 창 순서를 관리하고 작업표시줄에 나타나지 않는 도구 창으로 설정한다. 바탕화면 보기(Win+D) 후에도 다시 표시되어야 하며, 다른 앱으로 이동하면 가려져야 한다. Explorer나 사용자 배경화면/작업영역을 변경하지 않는다. 셸 프로세스의 자식으로 재부모화하지 않아 DPI 및 수명 결합을 피한다. 위젯 찾기 트레이 동작은 잠시 찾기 쉽게 표시하고 다른 앱으로 이동하면 원래 위치 계층으로 돌아간다.

검증: 창순서 정책 단위테스트, 기존 저장·게임 회귀, 작업표시줄/Alt+Tab·Win+D·다른창겹침·드래그·종료/재실행은 사용자 수동 확인. 셸 동작은 Windows 버전별 차이가 있으므로 자동 테스트만으로 완료를 단정하지 않는다.

## 구현 근거

- [Microsoft 확장 창 스타일](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles): WS_EX_TOOLWINDOW의 작업표시줄/Alt+Tab 제외.
- [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos): 자체 창의 위치/순서 조정.
- [SetWinEventHook](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook): out-of-context foreground 관찰. 외부 프로세스 코드 삽입 없음.
- [SetParent](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent): 다른 DPI 모드 간 부모 변경의 제약 때문에 셸 자식으로 재부모화하지 않음.

셸 호스트 식별은 Explorer의 Progman/WorkerW와 SHELLDLL_DefView를 읽기 전용으로 찾는다. 이 부분은 Explorer 구현 의존성이 있어 실제 Windows 환경에서 동작을 확인해야 한다. Rainmeter의 공개 구현도 검토해 단순 아래 배치와 OnDesktop 동작이 다른 점을 확인했으나 외부 소스 코드는 복사하지 않았다.
