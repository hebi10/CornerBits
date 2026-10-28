# Windows 빌드와 배포

[최신 Windows 다운로드](https://github.com/hebi10/CornerBits/releases/latest) · [Actions](https://github.com/hebi10/CornerBits/actions/workflows/windows.yml)

## 자동 빌드

`master`/`main` 푸시, Pull Request, Actions의 **Run workflow**로 Windows x64 검사와 빌드를 실행합니다. 타입체크·게임 테스트·브라우저 테스트·Rust 포맷/테스트가 성공해야 NSIS 설치 파일과 압축 실행본을 생성합니다.

Actions 실행의 `CornerBits-windows-x64` 아티팩트는 30일 보관합니다. Actions 아티팩트 다운로드에는 GitHub 로그인이 필요하며, 일반 사용자는 Releases에서 받습니다. [GitHub 아티팩트 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

## 새 버전 공개

package.json/package-lock.json, src-tauri/Cargo.toml/Cargo.lock, src-tauri/tauri.conf.json의 앱 버전을 함께 올리고 변경을 커밋·푸시합니다. 해당 버전의 태그를 푸시하면 같은 검사와 빌드 후 Releases에 다운로드 파일을 공개합니다.

```powershell
git tag v0.9.2
git push origin v0.9.2
```

태그는 `v`와 package.json 버전이 정확히 일치해야 합니다. 기존 Release나 파일을 강제로 덮어쓰지 않습니다. 배포 작업만 저장소 쓰기 권한을 사용하며, 사용자의 개인 GitHub 토큰이나 로컬 개발 도구는 빌드에 포함하지 않습니다.

## 로컬 패키징

기존 개발 빌드는 설치 파일을 만들지 않습니다. 배포할 때만 별도 설정을 덮어씁니다.

```powershell
npm ci
npm run tauri -- build --ci --config src-tauri/tauri.release.conf.json --bundles nsis -- --locked
./scripts/package-windows.ps1 -OutputDirectory release/windows
```

이 PC에서 최소 빌드 도구를 사용할 때는 먼저 `. ./.tools/native-env.ps1`을 실행합니다. GitHub Windows runner는 자체 Visual Studio/MSVC/SDK와 Rust를 사용하므로 이 로컬 파일을 필요로 하지 않습니다.

패키징은 버전·실행 파일·설치기를 검사하고 설치 EXE, `cornerbits.exe`와 사용 안내만 담은 ZIP, SHA256SUMS.txt를 생성합니다. 앱의 APPDATA 기록·스냅샷·개인 파일은 포함하지 않습니다. 실제 다운로드 후 SHA-256으로 릴리스 자산을 확인합니다. [Tauri Windows 설치기 안내](https://v2.tauri.app/distribute/windows-installer/)
