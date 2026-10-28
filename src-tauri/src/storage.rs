use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub always_on_top: bool,
    pub compact: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppState {
    pub schema_version: u8,
    pub revision: u64,
    pub updated_at: String,
    pub settings: Settings,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    pub backup_version: u8,
    pub exported_at: String,
    pub state: AppState,
}

impl AppState {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("지원하지 않는 데이터 버전입니다.".into());
        }
        if self.revision > 9_007_199_254_740_991 {
            return Err("데이터 변경 번호가 올바르지 않습니다.".into());
        }
        validate_timestamp(&self.updated_at)?;
        Ok(())
    }
}

fn validate_timestamp(value: &str) -> Result<(), String> {
    DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| "날짜 형식이 올바르지 않습니다.".into())
}

pub fn parse_backup(bytes: &[u8]) -> Result<Backup, String> {
    validate_size(bytes)?;
    let backup: Backup = serde_json::from_slice(bytes)
        .map_err(|_| "CornerBits 백업 형식이 올바르지 않습니다.".to_owned())?;
    if backup.format != "CornerBits" || backup.backup_version != 1 {
        return Err("지원하지 않는 백업 형식 또는 버전입니다.".into());
    }
    validate_timestamp(&backup.exported_at)?;
    backup.state.validate()?;
    Ok(backup)
}

fn validate_size(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_BYTES {
        return Err("파일은 2 MiB 이하여야 합니다.".into());
    }
    Ok(())
}

pub fn read_backup_file(path: &Path) -> Result<String, String> {
    let bytes = read_limited(path)?;
    parse_backup(&bytes)?;
    String::from_utf8(bytes).map_err(|_| "백업 파일은 UTF-8이어야 합니다.".into())
}

fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|error| format!("파일을 읽지 못했습니다: {error}"))?;
    let mut bytes = Vec::new();
    file.take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("파일을 읽지 못했습니다: {error}"))?;
    validate_size(&bytes)?;
    Ok(bytes)
}

fn state_bytes(state: &AppState) -> Result<Vec<u8>, String> {
    state.validate()?;
    let bytes = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    validate_size(&bytes)?;
    Ok(bytes)
}

fn backup_bytes(state: &AppState, now: DateTime<Utc>) -> Result<Vec<u8>, String> {
    state.validate()?;
    let bytes = serde_json::to_vec_pretty(&Backup {
        format: "CornerBits".into(),
        backup_version: 1,
        exported_at: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        state: state.clone(),
    })
    .map_err(|error| error.to_string())?;
    parse_backup(&bytes)?;
    Ok(bytes)
}

static FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Writes and flushes a sibling temporary file before replacing the destination.
/// In particular, the old state is never unlinked before the replacement succeeds.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("저장 경로가 올바르지 않습니다.")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("저장 폴더를 만들지 못했습니다: {error}"))?;
    let temp_path = parent.join(format!(
        ".cornerbits-{}-{}-{}.tmp",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default(),
        FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temp_path, path)?;
        #[cfg(unix)]
        File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if let Err(error) = result {
        // This removes only this operation's unpublished temporary file.
        let _ = fs::remove_file(&temp_path);
        return Err(format!("파일을 안전하게 저장하지 못했습니다: {error}"));
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // Both paths have the same parent, so this cannot become a cross-volume copy/delete.
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

pub struct Store {
    pub(crate) root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn load(&self) -> Result<Option<AppState>, String> {
        let path = self.root.join("state.json");
        match fs::metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("저장 파일을 확인하지 못했습니다: {error}")),
            Ok(_) => {}
        }
        let bytes = read_limited(&path)?;
        let state: AppState = serde_json::from_slice(&bytes)
            .map_err(|_| "저장 데이터가 손상되었거나 형식이 올바르지 않습니다.".to_owned())?;
        state.validate()?;
        Ok(Some(state))
    }

    pub fn save_at(&self, state: &AppState, now: DateTime<Utc>) -> Result<(), String> {
        let bytes = state_bytes(state)?;
        if let Some(previous) = self.load()? {
            if previous == *state {
                return Ok(());
            }
            let path = self
                .root
                .join("snapshots")
                .join(format!("daily-{}.json", now.format("%Y-%m-%d")));
            match fs::metadata(&path) {
                Ok(_) => {
                    parse_backup(&read_limited(&path)?)?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    atomic_write(&path, &backup_bytes(&previous, now)?)?;
                }
                Err(error) => return Err(format!("일일 백업을 확인하지 못했습니다: {error}")),
            }
        }
        atomic_write(&self.root.join("state.json"), &bytes)
    }

    pub fn restore_at(&self, state: &AppState, now: DateTime<Utc>) -> Result<(), String> {
        let bytes = state_bytes(state)?;
        let snapshot_name = format!(
            "pre-restore-{}-{}",
            now.format("%Y%m%dT%H%M%S%.9fZ"),
            FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let snapshots = self.root.join("snapshots");
        match self.load() {
            Ok(Some(previous)) => atomic_write(
                &snapshots.join(format!("{snapshot_name}.cornerbits")),
                &backup_bytes(&previous, now)?,
            )?,
            Ok(None) => {}
            Err(_) => {
                // The 2 MiB limit applies to incoming state and backups. Corrupt
                // existing files may be larger: stream their exact bytes into a
                // new raw snapshot and flush it before changing current data.
                let mut original = File::open(self.root.join("state.json"))
                    .map_err(|error| format!("복원 전 원본을 읽지 못했습니다: {error}"))?;
                fs::create_dir_all(&snapshots)
                    .map_err(|error| format!("복원 전 백업 폴더를 만들지 못했습니다: {error}"))?;
                let mut snapshot = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(snapshots.join(format!("{snapshot_name}.raw-state.json")))
                    .map_err(|error| format!("복원 전 원본 백업을 만들지 못했습니다: {error}"))?;
                std::io::copy(&mut original, &mut snapshot)
                    .and_then(|_| snapshot.sync_all())
                    .map_err(|error| format!("복원 전 원본 백업을 완료하지 못했습니다: {error}"))?;
                // On copy/flush failure a partial snapshot may remain, but the
                // original state is never replaced and no snapshot is deleted.
            }
        }
        atomic_write(&self.root.join("state.json"), &bytes)
    }

    pub fn export_to(&self, path: &Path, now: DateTime<Utc>) -> Result<(), String> {
        let state = self.load()?.ok_or("내보낼 저장 데이터가 아직 없습니다.")?;
        let resolved = if path.exists() {
            fs::canonicalize(path)
        } else {
            path.parent()
                .ok_or("백업 경로가 올바르지 않습니다.")?
                .canonicalize()
                .map(|parent| parent.join(path.file_name().unwrap_or_default()))
        }
        .map_err(|error| format!("백업 경로를 확인하지 못했습니다: {error}"))?;
        let root = self
            .root
            .canonicalize()
            .map_err(|error| error.to_string())?;
        #[cfg(windows)]
        let internal = resolved
            .to_string_lossy()
            .to_lowercase()
            .starts_with(&format!("{}\\", root.to_string_lossy().to_lowercase()));
        #[cfg(not(windows))]
        let internal = resolved.starts_with(root);
        if internal {
            return Err("앱의 내부 저장 폴더에는 내보낼 수 없습니다.".into());
        }
        atomic_write(path, &backup_bytes(&state, now)?)
    }

    pub fn load_position(&self) -> Result<Option<crate::position::Point>, String> {
        let path = self.root.join("window-position.json");
        match fs::metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("창 위치를 읽지 못했습니다: {error}")),
            Ok(_) => {}
        }
        serde_json::from_slice(&read_limited(&path)?)
            .map(Some)
            .map_err(|_| "저장된 창 위치 형식이 올바르지 않습니다.".into())
    }

    pub fn save_position(&self, point: crate::position::Point) -> Result<(), String> {
        let bytes = serde_json::to_vec(&point).map_err(|error| error.to_string())?;
        atomic_write(&self.root.join("window-position.json"), &bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn state(revision: u64) -> AppState {
        AppState {
            schema_version: 1,
            revision,
            updated_at: "2026-10-28T01:00:00.000Z".into(),
            settings: Settings {
                always_on_top: false,
                compact: false,
            },
        }
    }

    fn now(day: u32) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&format!("2026-10-{day:02}T12:00:00Z"))
            .unwrap()
            .into()
    }

    #[test]
    fn rejects_future_schema_invalid_timestamp_and_unsafe_revision() {
        let mut value = state(0);
        value.schema_version = 2;
        assert!(value.validate().is_err());
        value.schema_version = 1;
        value.updated_at = "2026-02-31T12:00:00Z".into();
        assert!(value.validate().is_err());
        value.updated_at = "2026-10-28T01:00:00Z".into();
        value.revision = 9_007_199_254_740_992;
        assert!(value.validate().is_err());
    }

    #[test]
    fn validates_backup_envelope_and_nested_state_independently() {
        let valid = br#"{"format":"CornerBits","backupVersion":1,"exportedAt":"2026-10-28T12:00:00Z","state":{"schemaVersion":1,"revision":4,"updatedAt":"2026-10-28T01:00:00Z","settings":{"alwaysOnTop":true,"compact":false}}}"#;
        assert_eq!(parse_backup(valid).unwrap().state.revision, 4);
        for invalid in [
            String::from_utf8(valid.to_vec())
                .unwrap()
                .replace("\"backupVersion\":1", "\"backupVersion\":2"),
            String::from_utf8(valid.to_vec())
                .unwrap()
                .replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
            String::from_utf8(valid.to_vec())
                .unwrap()
                .replace("\"compact\":false", "\"compact\":false,\"extra\":true"),
            String::from_utf8(valid.to_vec())
                .unwrap()
                .replace("2026-10-28T12:00:00Z", "not a timestamp"),
        ] {
            assert!(parse_backup(invalid.as_bytes()).is_err());
        }
        assert!(parse_backup(&vec![b' '; MAX_BYTES + 1]).is_err());
    }

    #[test]
    fn missing_state_is_empty_but_malformed_state_is_an_error() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        assert_eq!(store.load().unwrap(), None);
        fs::write(directory.path().join("state.json"), b"{invalid}").unwrap();
        assert!(store.load().is_err());
        assert!(store.save_at(&state(1), now(28)).is_err());
        assert_eq!(
            fs::read(directory.path().join("state.json")).unwrap(),
            b"{invalid}"
        );
    }

    #[test]
    fn saves_reload_and_keep_first_previous_state_per_utc_day() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(0), now(28)).unwrap();
        store.save_at(&state(1), now(28)).unwrap();
        store.save_at(&state(2), now(28)).unwrap();
        assert_eq!(store.load().unwrap(), Some(state(2)));
        let first = fs::read(directory.path().join("snapshots/daily-2026-10-28.json")).unwrap();
        assert_eq!(parse_backup(&first).unwrap().state, state(0));
        store.save_at(&state(3), now(29)).unwrap();
        let second = fs::read(directory.path().join("snapshots/daily-2026-10-29.json")).unwrap();
        assert_eq!(parse_backup(&second).unwrap().state, state(2));
        assert_eq!(
            fs::read_dir(directory.path().join("snapshots"))
                .unwrap()
                .count(),
            2
        );
    }

    #[test]
    fn unchanged_save_does_not_create_a_daily_snapshot() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(1), now(28)).unwrap();
        store.save_at(&state(1), now(29)).unwrap();
        assert!(!directory.path().join("snapshots").exists());
    }

    #[test]
    fn restore_preserves_previous_state_and_rejects_invalid_input_without_changes() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(8), now(28)).unwrap();
        let mut invalid = state(2);
        invalid.schema_version = 2;
        assert!(store.restore_at(&invalid, now(28)).is_err());
        assert_eq!(store.load().unwrap(), Some(state(8)));
        store.restore_at(&state(2), now(28)).unwrap();
        assert_eq!(store.load().unwrap(), Some(state(2)));
        let snapshot = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(snapshot
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("pre-restore-"));
        assert_eq!(
            parse_backup(&fs::read(snapshot).unwrap()).unwrap().state,
            state(8)
        );
    }

    #[test]
    fn snapshot_failure_preserves_current_state_during_save_and_restore() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(8), now(28)).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.save_at(&state(9), now(28)).is_err());
        assert!(store.restore_at(&state(2), now(28)).is_err());
        assert_eq!(store.load().unwrap(), Some(state(8)));
    }

    #[test]
    fn valid_restore_recovers_corrupt_state_after_preserving_original_bytes() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let original = b"{corrupted original bytes}";
        fs::write(directory.path().join("state.json"), original).unwrap();
        let mut invalid = state(1);
        invalid.schema_version = 2;
        assert!(store.restore_at(&invalid, now(28)).is_err());
        assert_eq!(
            fs::read(directory.path().join("state.json")).unwrap(),
            original
        );
        store.restore_at(&state(2), now(28)).unwrap();
        assert_eq!(store.load().unwrap(), Some(state(2)));
        let snapshot = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(snapshot).unwrap(), original);
    }

    #[test]
    fn corrupt_state_is_not_replaced_when_recovery_snapshot_fails() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let original = b"{corrupted original bytes}";
        fs::write(directory.path().join("state.json"), original).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.restore_at(&state(2), now(28)).is_err());
        assert_eq!(
            fs::read(directory.path().join("state.json")).unwrap(),
            original
        );
    }

    #[test]
    fn valid_restore_recovers_oversized_corrupt_state_with_exact_raw_snapshot() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let original = vec![b'X'; MAX_BYTES + 257];
        let state_path = directory.path().join("state.json");
        fs::write(&state_path, &original).unwrap();
        assert!(store.load().is_err());

        store.restore_at(&state(2), now(28)).unwrap();

        assert_eq!(store.load().unwrap(), Some(state(2)));
        let snapshot = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(snapshot
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with(".raw-state.json"));
        assert_eq!(fs::read(snapshot).unwrap(), original);
    }

    #[test]
    fn export_roundtrips_and_cannot_overwrite_internal_state() {
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(8), now(28)).unwrap();
        let export = export_directory.path().join("backup.json");
        store.export_to(&export, now(28)).unwrap();
        let text = read_backup_file(&export).unwrap();
        assert_eq!(parse_backup(text.as_bytes()).unwrap().state, state(8));
        assert!(store
            .export_to(&directory.path().join("state.json"), now(28))
            .is_err());
        assert_eq!(store.load().unwrap(), Some(state(8)));
    }

    #[test]
    fn oversized_file_is_rejected_before_parsing_or_replacement() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("state.json");
        fs::write(&path, vec![b' '; MAX_BYTES + 1]).unwrap();
        let store = Store::new(directory.path().to_owned());
        assert!(store.load().is_err());
        assert!(store.save_at(&state(1), now(28)).is_err());
        assert_eq!(fs::metadata(path).unwrap().len(), (MAX_BYTES + 1) as u64);
    }

    #[cfg(windows)]
    #[test]
    fn failed_windows_atomic_replacement_keeps_the_old_file() {
        use std::fs::OpenOptions;
        use std::os::windows::fs::OpenOptionsExt;
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state(8), now(28)).unwrap();
        let path = directory.path().join("state.json");
        let before = fs::read(&path).unwrap();
        // Allow reading for snapshot, but deny FILE_SHARE_DELETE so replacement fails.
        let held = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        assert!(store.save_at(&state(9), now(28)).is_err());
        drop(held);
        assert_eq!(fs::read(path).unwrap(), before);
    }
}
