use crate::game_state::{
    deserialize_integer, CircuitState, Games, GardenState, LegacyFishingState, LegacyGardenState,
    MineState, SwordState,
};
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
    #[serde(deserialize_with = "deserialize_integer")]
    pub schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    pub revision: u64,
    pub updated_at: String,
    pub settings: Settings,
    pub games: Games,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub format: String,
    #[serde(deserialize_with = "deserialize_integer")]
    pub backup_version: u64,
    pub exported_at: String,
    pub state: AppState,
}

impl AppState {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 6 {
            return Err("지원하지 않는 데이터 버전입니다.".into());
        }
        if self.revision > 9_007_199_254_740_991 {
            return Err("데이터 변경 번호가 올바르지 않습니다.".into());
        }
        validate_timestamp(&self.updated_at)?;
        self.games.validate()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyState {
    #[serde(deserialize_with = "deserialize_integer")]
    schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    revision: u64,
    updated_at: String,
    settings: Settings,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V2Games {
    mine: MineState,
    garden: LegacyGardenState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V3Games {
    mine: MineState,
    garden: LegacyGardenState,
    circuit: CircuitState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V3State {
    #[serde(deserialize_with = "deserialize_integer")]
    schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    revision: u64,
    updated_at: String,
    settings: Settings,
    games: V3Games,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V4Games {
    mine: MineState,
    garden: GardenState,
    circuit: CircuitState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V4State {
    #[serde(deserialize_with = "deserialize_integer")]
    schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    revision: u64,
    updated_at: String,
    settings: Settings,
    games: V4Games,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V5Games {
    mine: MineState,
    garden: GardenState,
    circuit: CircuitState,
    fishing: LegacyFishingState,
    sword: SwordState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V5State {
    #[serde(deserialize_with = "deserialize_integer")]
    schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    revision: u64,
    updated_at: String,
    settings: Settings,
    games: V5Games,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct V2State {
    #[serde(deserialize_with = "deserialize_integer")]
    schema_version: u64,
    #[serde(deserialize_with = "deserialize_integer")]
    revision: u64,
    updated_at: String,
    settings: Settings,
    games: V2Games,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum StoredState {
    Current(AppState),
    V5(V5State),
    V4(V4State),
    V3(V3State),
    V2(V2State),
    Legacy(LegacyState),
}

impl StoredState {
    fn normalize(self) -> Result<(AppState, bool), String> {
        let (state, migrated) = match self {
            Self::Current(state) => (state, false),
            Self::V5(previous) => {
                if previous.schema_version != 5 {
                    return Err("지원하지 않는 데이터 버전입니다.".into());
                }
                (
                    AppState {
                        schema_version: 6,
                        revision: previous.revision,
                        updated_at: previous.updated_at,
                        settings: previous.settings,
                        games: Games {
                            mine: previous.games.mine,
                            garden: previous.games.garden,
                            circuit: previous.games.circuit,
                            fishing: previous.games.fishing.into(),
                            sword: previous.games.sword,
                        },
                    },
                    true,
                )
            }
            Self::V4(previous) => {
                if previous.schema_version != 4 {
                    return Err("지원하지 않는 데이터 버전입니다.".into());
                }
                (
                    AppState {
                        schema_version: 6,
                        revision: previous.revision,
                        updated_at: previous.updated_at,
                        settings: previous.settings,
                        games: Games {
                            mine: previous.games.mine,
                            garden: previous.games.garden,
                            circuit: previous.games.circuit,
                            ..Games::default()
                        },
                    },
                    true,
                )
            }
            Self::V3(previous) => {
                if previous.schema_version != 3 {
                    return Err("지원하지 않는 데이터 버전입니다.".into());
                }
                (
                    AppState {
                        schema_version: 6,
                        revision: previous.revision,
                        updated_at: previous.updated_at,
                        settings: previous.settings,
                        games: Games {
                            mine: previous.games.mine,
                            garden: previous.games.garden.into(),
                            circuit: previous.games.circuit,
                            ..Games::default()
                        },
                    },
                    true,
                )
            }
            Self::V2(previous) => {
                if previous.schema_version != 2 {
                    return Err("지원하지 않는 데이터 버전입니다.".into());
                }
                (
                    AppState {
                        schema_version: 6,
                        revision: previous.revision,
                        updated_at: previous.updated_at,
                        settings: previous.settings,
                        games: Games {
                            mine: previous.games.mine,
                            garden: previous.games.garden.into(),
                            circuit: CircuitState::default(),
                            ..Games::default()
                        },
                    },
                    true,
                )
            }
            Self::Legacy(legacy) => {
                if legacy.schema_version != 1 {
                    return Err("지원하지 않는 데이터 버전입니다.".into());
                }
                (
                    AppState {
                        schema_version: 6,
                        revision: legacy.revision,
                        updated_at: legacy.updated_at,
                        settings: legacy.settings,
                        games: Games::default(),
                    },
                    true,
                )
            }
        };
        state.validate()?;
        Ok((state, migrated))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredBackup {
    format: String,
    #[serde(deserialize_with = "deserialize_integer")]
    backup_version: u64,
    exported_at: String,
    state: StoredState,
}

fn validate_timestamp(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let valid_prefix = bytes.len() >= 20
        && bytes[..19]
            .iter()
            .enumerate()
            .all(|(index, byte)| match index {
                4 | 7 => *byte == b'-',
                10 => *byte == b'T',
                13 | 16 => *byte == b':',
                _ => byte.is_ascii_digit(),
            })
        && bytes[17] < b'6';
    if !valid_prefix {
        return Err("날짜 형식이 올바르지 않습니다.".into());
    }
    let mut zone = &bytes[19..];
    if zone.first() == Some(&b'.') {
        let digits = zone[1..]
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if !(1..=9).contains(&digits) {
            return Err("날짜 형식이 올바르지 않습니다.".into());
        }
        zone = &zone[digits + 1..];
    }
    let valid_zone = zone == b"Z"
        || (zone.len() == 6
            && matches!(zone[0], b'+' | b'-')
            && zone[3] == b':'
            && [1, 2, 4, 5]
                .iter()
                .all(|index| zone[*index].is_ascii_digit()));
    if !valid_zone {
        return Err("날짜 형식이 올바르지 않습니다.".into());
    }
    DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| "날짜 형식이 올바르지 않습니다.".into())
}

pub fn parse_backup(bytes: &[u8]) -> Result<Backup, String> {
    validate_size(bytes)?;
    let backup: StoredBackup = serde_json::from_slice(bytes)
        .map_err(|_| "CornerBits 백업 형식이 올바르지 않습니다.".to_owned())?;
    if backup.format != "CornerBits" || backup.backup_version != 1 {
        return Err("지원하지 않는 백업 형식 또는 버전입니다.".into());
    }
    validate_timestamp(&backup.exported_at)?;
    let (state, _) = backup.state.normalize()?;
    Ok(Backup {
        format: backup.format,
        backup_version: backup.backup_version,
        exported_at: backup.exported_at,
        state,
    })
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
        let stored: StoredState = serde_json::from_slice(&bytes)
            .map_err(|_| "저장 데이터가 손상되었거나 형식이 올바르지 않습니다.".to_owned())?;
        let (state, migrated) = stored.normalize()?;
        if migrated {
            let snapshot = self.root.join("snapshots").join(format!(
                "pre-migration-{}-{}-{}.json",
                Utc::now().format("%Y%m%dT%H%M%S%.9fZ"),
                std::process::id(),
                FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            // Preserve the original v1/v2/v3 formatting and bytes before replacing it.
            // Any snapshot error returns without touching state.json.
            atomic_write(&snapshot, &bytes)?;
            atomic_write(&path, &state_bytes(&state)?)?;
        }
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
            schema_version: 6,
            revision,
            updated_at: "2026-10-28T01:00:00.000Z".into(),
            settings: Settings {
                always_on_top: false,
                compact: false,
            },
            games: Games::default(),
        }
    }

    fn now(day: u32) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&format!("2026-10-{day:02}T12:00:00Z"))
            .unwrap()
            .into()
    }

    fn legacy_bytes() -> &'static [u8] {
        b"{\r\n  \"schemaVersion\":1, \"revision\":7,\"updatedAt\":\"2026-10-28T01:00:00.000Z\",\"settings\":{\"alwaysOnTop\":true,\"compact\":true}\r\n}\r\n"
    }

    fn populated_v2() -> serde_json::Value {
        let mut inventory = vec![0; 30];
        inventory[0] = 2;
        inventory[29] = 1;
        let mut collected = vec![0; 30];
        collected[0] = 10;
        collected[29] = 3;
        let mut harvested = vec![0; 40];
        harvested[0] = 5;
        harvested[39] = 2;
        serde_json::json!({
            "schemaVersion": 2, "revision": 42,
            "updatedAt": "2026-10-28T01:00:00.000Z",
            "settings": {"alwaysOnTop": true, "compact": false},
            "games": {
                "mine": {"depth": 101, "pickaxe": 3, "coins": 234,
                    "inventory": inventory, "collected": collected,
                    "tiles": [0,1,2,3,4,0,1,2,3,4,0,1,2,3,4,0,1,2,3,4,0,1,2,3,4],
                    "totalMined": 13},
                "garden": {"coins": 123,
                    "pots": [null, {"species": 39, "plantedAt": 1000, "watered": true},
                        {"species": 0, "plantedAt": 2000, "watered": false}],
                    "harvested": harvested, "totalHarvests": 7, "lastObservedAt": 2000}
            }
        })
    }

    fn backup_value(state: serde_json::Value) -> serde_json::Value {
        serde_json::json!({"format":"CornerBits", "backupVersion":1,
            "exportedAt":"2026-10-28T12:00:00Z", "state":state})
    }

    fn populated_v3() -> serde_json::Value {
        let mut value = populated_v2();
        value["schemaVersion"] = serde_json::json!(3);
        let mut records = vec![0; 300];
        records[0] = 24;
        value["games"]["circuit"] = serde_json::json!({
            "stage": 2,
            "rotations": [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
            "turns": 9, "records": records, "totalClears": 3
        });
        value
    }

    fn populated_v4() -> serde_json::Value {
        let mut value = populated_v3();
        value["schemaVersion"] = serde_json::json!(4);
        value["games"]["garden"]["unlockedSpecies"] = serde_json::json!(40);
        value
    }

    fn populated_v5() -> serde_json::Value {
        let mut value = populated_v4();
        value["schemaVersion"] = serde_json::json!(5);
        value["games"]["fishing"] = serde_json::json!({
            "rng": 0x6d2b79f5_u64, "coins": 0, "rod": 1, "location": 0, "bait": 0,
            "caught": vec![0; 36], "totalCaught": 0, "casts": 0, "misses": 0,
            "streak": 0, "bestStreak": 0, "lastObservedAt": 0, "cast": null
        });
        value["games"]["sword"] = serde_json::json!({
            "rng": 0x1a2b3c4d_u64, "level": 0, "ore": 0, "shards": 0,
            "attempts": 0, "successes": 0, "failures": 0, "pity": 0,
            "totalPolishes": 0, "lastObservedAt": 0, "nextPolishAt": 0,
            "lastResult": "none"
        });
        value
    }

    fn populated_v6() -> serde_json::Value {
        let mut value = populated_v5();
        value["schemaVersion"] = serde_json::json!(6);
        value["games"]["fishing"]["inventory"] = serde_json::json!(vec![0; 36]);
        value["games"]["fishing"]["inventoryBonus"] = serde_json::json!(0);
        value["games"]["fishing"]["baitStock"] = serde_json::json!([0, 0]);
        value["games"]["fishing"]["unlockedLocations"] = serde_json::json!(1);
        value
    }

    #[test]
    fn v6_requires_the_trade_contract_and_accepts_initial_empty_stock() {
        let expected = populated_v6();
        let parsed =
            parse_backup(&serde_json::to_vec(&backup_value(expected.clone())).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(parsed.state).unwrap(), expected);
    }

    fn add_new_games(value: &mut serde_json::Value) {
        value["schemaVersion"] = serde_json::json!(6);
        value["games"]["fishing"] = populated_v6()["games"]["fishing"].clone();
        value["games"]["sword"] = populated_v6()["games"]["sword"].clone();
    }

    #[test]
    fn v6_requires_fishing_and_sword_and_accepts_their_initial_contract() {
        let good = populated_v6();
        let parsed =
            parse_backup(&serde_json::to_vec(&backup_value(good.clone())).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(parsed.state).unwrap(), good);
        for game in ["fishing", "sword"] {
            let mut missing = good.clone();
            missing["games"].as_object_mut().unwrap().remove(game);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(missing)).unwrap()).is_err());
        }
    }

    #[test]
    fn v6_sword_polish_cooldown_cannot_exceed_one_interval_from_its_observation() {
        let good = populated_v6();
        for (observed, next) in [
            (0_u64, 0_u64),
            (0, 10_000),
            (1_000, 11_000),
            (8_640_000_000_000_000, 8_640_000_000_000_000),
        ] {
            let mut value = good.clone();
            value["games"]["sword"]["lastObservedAt"] = serde_json::json!(observed);
            value["games"]["sword"]["nextPolishAt"] = serde_json::json!(next);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_ok());
        }
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let state: AppState = serde_json::from_value(good.clone()).unwrap();
        store.save_at(&state, now(28)).unwrap();
        let path = directory.path().join("state.json");
        let original = fs::read(&path).unwrap();
        for (observed, next) in [
            (0_u64, 10_001_u64),
            (1_000, 11_001),
            (0, 8_640_000_000_000_000),
        ] {
            let mut value = good.clone();
            value["games"]["sword"]["lastObservedAt"] = serde_json::json!(observed);
            value["games"]["sword"]["nextPolishAt"] = serde_json::json!(next);
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value.clone())).unwrap()).is_err()
            );
            let state: AppState = serde_json::from_value(value).unwrap();
            assert!(store.save_at(&state, now(28)).is_err());
            assert!(store.restore_at(&state, now(28)).is_err());
        }
        assert_eq!(fs::read(path).unwrap(), original);
        assert!(!directory.path().join("snapshots").exists());
    }

    #[test]
    fn v6_roundtrips_a_pending_cast_and_sword_failure_without_advancing_rng() {
        let mut expected = populated_v6();
        let fishing = &mut expected["games"]["fishing"];
        fishing["caught"][0] = serde_json::json!(1);
        fishing["totalCaught"] = serde_json::json!(1);
        fishing["casts"] = serde_json::json!(2);
        fishing["streak"] = serde_json::json!(1);
        fishing["bestStreak"] = serde_json::json!(1);
        fishing["lastObservedAt"] = serde_json::json!(1_000);
        fishing["cast"] = serde_json::json!({
            "startedAt": 1_000, "biteAt": 20_000, "expiresAt": 25_000, "species": 0
        });
        expected["games"]["sword"] = serde_json::json!({
            "rng": 7, "level": 1, "ore": 100, "shards": 2,
            "attempts": 3, "successes": 1, "failures": 2, "pity": 2,
            "totalPolishes": 5, "lastObservedAt": 1_000, "nextPolishAt": 11_000,
            "lastResult": "failure"
        });
        let state: AppState = serde_json::from_value(expected.clone()).unwrap();
        state.validate().unwrap();
        let directory = tempdir().unwrap();
        let exports = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&state, now(28)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap()).unwrap(),
            expected
        );
        let export = exports.path().join("pending-games.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let imported = parse_backup(&fs::read(export).unwrap()).unwrap().state;
        assert_eq!(imported, state);
        store.restore_at(&imported, now(29)).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), state);
    }

    #[test]
    fn v6_rejects_new_game_ranges_relations_and_malformed_casts_without_overwriting() {
        let good = populated_v6();
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let state: AppState = serde_json::from_value(good.clone()).unwrap();
        store.save_at(&state, now(28)).unwrap();
        let path = directory.path().join("state.json");
        let original = fs::read(&path).unwrap();
        let invalid_fields = [
            ("/games/fishing/rng", serde_json::json!(0)),
            ("/games/fishing/rng", serde_json::json!(4294967296_u64)),
            ("/games/fishing/coins", serde_json::json!(1000000000001_u64)),
            ("/games/fishing/rod", serde_json::json!(0)),
            ("/games/fishing/rod", serde_json::json!(9)),
            ("/games/fishing/location", serde_json::json!(6)),
            ("/games/fishing/bait", serde_json::json!(3)),
            ("/games/fishing/caught", serde_json::json!(vec![0; 35])),
            ("/games/fishing/caught/0", serde_json::json!(1)),
            ("/games/fishing/totalCaught", serde_json::json!(1)),
            ("/games/fishing/casts", serde_json::json!(1)),
            ("/games/fishing/misses", serde_json::json!(1)),
            ("/games/fishing/streak", serde_json::json!(1)),
            ("/games/fishing/bestStreak", serde_json::json!(1)),
            (
                "/games/fishing/lastObservedAt",
                serde_json::json!(8640000000000001_u64),
            ),
            ("/games/fishing/cast", serde_json::json!({})),
            ("/games/sword/rng", serde_json::json!(0)),
            ("/games/sword/rng", serde_json::json!(4294967296_u64)),
            ("/games/sword/level", serde_json::json!(61)),
            ("/games/sword/ore", serde_json::json!(1000000000001_u64)),
            ("/games/sword/shards", serde_json::json!(1000000000001_u64)),
            ("/games/sword/attempts", serde_json::json!(1)),
            ("/games/sword/successes", serde_json::json!(1)),
            ("/games/sword/failures", serde_json::json!(1)),
            ("/games/sword/pity", serde_json::json!(40)),
            ("/games/sword/pity", serde_json::json!(1)),
            (
                "/games/sword/totalPolishes",
                serde_json::json!(1000000000001_u64),
            ),
            (
                "/games/sword/lastObservedAt",
                serde_json::json!(8640000000000001_u64),
            ),
            (
                "/games/sword/nextPolishAt",
                serde_json::json!(8640000000000001_u64),
            ),
            ("/games/sword/lastResult", serde_json::json!("unknown")),
        ];
        for (pointer, invalid) in invalid_fields {
            let mut value = good.clone();
            *value.pointer_mut(pointer).unwrap() = invalid;
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value.clone())).unwrap()).is_err(),
                "accepted {pointer}"
            );
            if let Ok(state) = serde_json::from_value::<AppState>(value) {
                assert!(store.save_at(&state, now(28)).is_err(), "saved {pointer}");
                assert!(
                    store.restore_at(&state, now(28)).is_err(),
                    "restored {pointer}"
                );
            }
        }
        let valid_cast = serde_json::json!({"startedAt": 1000, "biteAt": 2000,
            "expiresAt": 7000, "species": 0});
        for (field, invalid) in [
            ("startedAt", serde_json::json!(2001)),
            ("biteAt", serde_json::json!(7000)),
            ("expiresAt", serde_json::json!(8640000000000001_u64)),
            ("species", serde_json::json!(6)),
            ("species", serde_json::json!(36)),
        ] {
            let mut value = good.clone();
            value["games"]["fishing"]["casts"] = serde_json::json!(1);
            value["games"]["fishing"]["lastObservedAt"] = serde_json::json!(1000);
            value["games"]["fishing"]["cast"] = valid_cast.clone();
            value["games"]["fishing"]["cast"][field] = invalid;
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err(),
                "accepted invalid cast {field}"
            );
        }
        for field in ["startedAt", "biteAt", "expiresAt", "species"] {
            let mut value = good.clone();
            value["games"]["fishing"]["casts"] = serde_json::json!(1);
            value["games"]["fishing"]["lastObservedAt"] = serde_json::json!(1000);
            value["games"]["fishing"]["cast"] = valid_cast.clone();
            value["games"]["fishing"]["cast"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err());
        }
        assert_eq!(fs::read(path).unwrap(), original);
        assert!(!directory.path().join("snapshots").exists());
    }

    #[test]
    fn v4_migration_snapshot_failure_preserves_the_original() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = serde_json::to_vec_pretty(&populated_v4()).unwrap();
        fs::write(&path, &original).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.load().is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn shared_v5_fixture_migrates_once_without_duplicate_payout_or_rng_changes() {
        let fixture = include_bytes!("../../tests/fixtures/phase-five.cornerbits");
        let previous: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        let mut expected = previous["state"].clone();
        expected["schemaVersion"] = serde_json::json!(6);
        expected["games"]["fishing"]["inventory"] = serde_json::json!(vec![0; 36]);
        expected["games"]["fishing"]["inventoryBonus"] = serde_json::json!(0);
        expected["games"]["fishing"]["baitStock"] = serde_json::json!([0, 0]);
        expected["games"]["fishing"]["unlockedLocations"] = serde_json::json!(1);
        let backup = parse_backup(fixture).unwrap();
        assert_eq!(serde_json::to_value(&backup.state).unwrap(), expected);
        let directory = tempdir().unwrap();
        let exports = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = serde_json::to_vec_pretty(&previous["state"]).unwrap();
        fs::write(&path, &original).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
        let normalized = fs::read(&path).unwrap();
        assert_ne!(normalized, original);
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
        assert_eq!(fs::read(path).unwrap(), normalized);
        let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(fs::read(&snapshots[0]).unwrap(), original);
        let export = exports.path().join("shared-v5.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        assert_eq!(
            parse_backup(&fs::read(export).unwrap()).unwrap().state,
            backup.state
        );
        store.restore_at(&backup.state, now(29)).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
    }

    #[test]
    fn shared_v6_reducer_fixture_roundtrips_sales_bait_stock_and_an_active_cast() {
        let fixture = include_bytes!("../../tests/fixtures/phase-six.cornerbits");
        let expected: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        let backup = parse_backup(fixture).unwrap();
        assert_eq!(
            serde_json::to_value(&backup.state).unwrap(),
            expected["state"]
        );
        assert_eq!(backup.state.schema_version, 6);
        assert_eq!(backup.state.games.fishing.coins, 238);
        assert_eq!(backup.state.games.fishing.total_caught, 7);
        assert_eq!(backup.state.games.fishing.inventory.iter().sum::<u64>(), 1);
        assert_eq!(backup.state.games.fishing.inventory_bonus, 6);
        assert_eq!(backup.state.games.fishing.bait_stock, vec![3, 0]);
        assert!(backup.state.games.fishing.cast.is_some());
        let directory = tempdir().unwrap();
        let exports = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = serde_json::to_vec_pretty(&expected["state"]).unwrap();
        fs::write(&path, &original).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
        assert_eq!(fs::read(path).unwrap(), original);
        assert!(!directory.path().join("snapshots").exists());
        let exported = exports.path().join("shared-v6.cornerbits");
        store.export_to(&exported, now(28)).unwrap();
        assert_eq!(
            parse_backup(&fs::read(exported).unwrap()).unwrap().state,
            backup.state
        );
        store.restore_at(&backup.state, now(29)).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
    }

    #[test]
    fn v5_fishing_migration_preserves_paid_catches_pending_cast_and_existing_regions() {
        for (catches, location, unlocked) in [
            (0_u64, 0_u64, 1_u64),
            (69, 0, 1),
            (70, 0, 2),
            (219, 0, 2),
            (220, 0, 3),
            (450, 0, 4),
            (800, 0, 5),
            (1200, 0, 6),
            (1, 5, 6),
        ] {
            let mut previous = populated_v5();
            let fishing = &mut previous["games"]["fishing"];
            fishing["rng"] = serde_json::json!(12345);
            fishing["coins"] = serde_json::json!(9876);
            fishing["rod"] = serde_json::json!(8);
            fishing["location"] = serde_json::json!(location);
            fishing["bait"] = serde_json::json!(2);
            fishing["caught"][0] = serde_json::json!(catches);
            fishing["totalCaught"] = serde_json::json!(catches);
            fishing["casts"] = serde_json::json!(catches + 4);
            fishing["misses"] = serde_json::json!(3);
            fishing["streak"] = serde_json::json!(catches.min(2));
            fishing["bestStreak"] = serde_json::json!(catches.min(3));
            fishing["lastObservedAt"] = serde_json::json!(1000);
            fishing["cast"] = serde_json::json!({
                "startedAt":1000, "biteAt":20000, "expiresAt":25000,
                "species":location * 6 + 5
            });
            let migrated =
                parse_backup(&serde_json::to_vec(&backup_value(previous.clone())).unwrap())
                    .unwrap()
                    .state;
            assert_eq!(migrated.games.fishing.inventory, vec![0; 36]);
            assert_eq!(migrated.games.fishing.inventory_bonus, 0);
            assert_eq!(migrated.games.fishing.bait_stock, vec![0; 2]);
            assert_eq!(migrated.games.fishing.unlocked_locations, unlocked);
            let mut preserved = serde_json::to_value(migrated).unwrap();
            preserved["schemaVersion"] = serde_json::json!(5);
            let fishing = preserved["games"]["fishing"].as_object_mut().unwrap();
            for key in [
                "inventory",
                "inventoryBonus",
                "baitStock",
                "unlockedLocations",
            ] {
                fishing.remove(key);
            }
            assert_eq!(preserved, previous);
            let directory = tempdir().unwrap();
            let store = Store::new(directory.path().to_owned());
            let path = directory.path().join("state.json");
            let original = format!("{}\r\n", serde_json::to_string_pretty(&previous).unwrap());
            fs::write(&path, &original).unwrap();
            assert_eq!(store.load().unwrap().unwrap().games.fishing.coins, 9876);
            let normalized = fs::read(&path).unwrap();
            assert_eq!(
                store.load().unwrap().unwrap().games.fishing.inventory,
                vec![0; 36]
            );
            assert_eq!(fs::read(&path).unwrap(), normalized);
            let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .collect();
            assert_eq!(snapshots.len(), 1);
            assert_eq!(fs::read(&snapshots[0]).unwrap(), original.as_bytes());
        }
    }

    #[test]
    fn v5_migration_snapshot_failure_preserves_exact_original_bytes() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = format!(
            "{}\r\n",
            serde_json::to_string_pretty(&populated_v5()).unwrap()
        );
        fs::write(&path, &original).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.load().is_err());
        assert_eq!(fs::read(path).unwrap(), original.as_bytes());
    }

    #[test]
    fn v6_trade_stock_bonus_and_region_relations_reject_without_overwriting() {
        let good = populated_v6();
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store
            .save_at(&serde_json::from_value(good.clone()).unwrap(), now(28))
            .unwrap();
        let path = directory.path().join("state.json");
        let original = fs::read(&path).unwrap();
        for (pointer, invalid) in [
            ("/games/fishing/inventory", serde_json::json!(vec![0; 35])),
            ("/games/fishing/inventory", serde_json::json!(vec![0; 37])),
            ("/games/fishing/inventory/0", serde_json::json!(1)),
            ("/games/fishing/inventory/0", serde_json::json!(-1)),
            ("/games/fishing/inventory/0", serde_json::json!(1.5)),
            (
                "/games/fishing/inventory/0",
                serde_json::json!(1000000000001_u64),
            ),
            ("/games/fishing/inventory/0", serde_json::json!(u64::MAX)),
            ("/games/fishing/inventoryBonus", serde_json::json!(1)),
            (
                "/games/fishing/inventoryBonus",
                serde_json::json!(1000000000001_u64),
            ),
            ("/games/fishing/inventoryBonus", serde_json::json!("0")),
            ("/games/fishing/baitStock", serde_json::json!([0])),
            ("/games/fishing/baitStock", serde_json::json!([0, 0, 0])),
            ("/games/fishing/baitStock/0", serde_json::json!(-1)),
            (
                "/games/fishing/baitStock/1",
                serde_json::json!(1000000000001_u64),
            ),
            ("/games/fishing/baitStock/1", serde_json::json!(0.5)),
            ("/games/fishing/unlockedLocations", serde_json::json!(0)),
            ("/games/fishing/unlockedLocations", serde_json::json!(7)),
            ("/games/fishing/unlockedLocations", serde_json::json!(1.5)),
            ("/games/fishing/location", serde_json::json!(1)),
        ] {
            let mut value = good.clone();
            *value.pointer_mut(pointer).unwrap() = invalid;
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value.clone())).unwrap()).is_err(),
                "accepted {pointer}"
            );
            if let Ok(state) = serde_json::from_value::<AppState>(value) {
                assert!(store.save_at(&state, now(28)).is_err(), "saved {pointer}");
                assert!(
                    store.restore_at(&state, now(28)).is_err(),
                    "restored {pointer}"
                );
            }
        }
        assert_eq!(fs::read(path).unwrap(), original);
        assert!(!directory.path().join("snapshots").exists());
    }

    #[test]
    fn v6_sale_bonus_boundaries_and_large_stock_do_not_overflow() {
        for (species, count, bonus, valid) in [
            (0, 1_u64, 6_u64, true),
            (0, 1, 7, false),
            (6, 1, 10, true),
            (6, 1, 11, false),
            (35, 1, 56, true),
            (35, 1, 57, false),
            (35, 1_000_000_000_000, 1_000_000_000_000, true),
        ] {
            let mut value = populated_v6();
            let fishing = &mut value["games"]["fishing"];
            fishing["caught"][species] = serde_json::json!(count);
            fishing["inventory"][species] = serde_json::json!(count);
            fishing["inventoryBonus"] = serde_json::json!(bonus);
            fishing["totalCaught"] = serde_json::json!(count);
            fishing["casts"] = serde_json::json!(count);
            fishing["baitStock"] =
                serde_json::json!([1_000_000_000_000_u64, 1_000_000_000_000_u64]);
            let parsed = parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap());
            assert_eq!(
                parsed.is_ok(),
                valid,
                "species {species}, count {count}, bonus {bonus}"
            );
        }
    }

    #[test]
    fn v6_roundtrips_unsold_fish_bait_and_permanent_regions_during_a_cast() {
        let mut expected = populated_v6();
        let fishing = &mut expected["games"]["fishing"];
        fishing["rng"] = serde_json::json!(987654321);
        fishing["coins"] = serde_json::json!(300);
        fishing["caught"][0] = serde_json::json!(10);
        fishing["caught"][35] = serde_json::json!(2);
        fishing["inventory"][0] = serde_json::json!(3);
        fishing["inventory"][35] = serde_json::json!(2);
        fishing["inventoryBonus"] = serde_json::json!(130);
        fishing["totalCaught"] = serde_json::json!(12);
        fishing["casts"] = serde_json::json!(14);
        fishing["misses"] = serde_json::json!(1);
        fishing["streak"] = serde_json::json!(2);
        fishing["bestStreak"] = serde_json::json!(4);
        fishing["location"] = serde_json::json!(5);
        fishing["unlockedLocations"] = serde_json::json!(6);
        fishing["bait"] = serde_json::json!(2);
        fishing["baitStock"] = serde_json::json!([14, 9]);
        fishing["lastObservedAt"] = serde_json::json!(1000);
        fishing["cast"] =
            serde_json::json!({"startedAt":1000,"biteAt":19000,"expiresAt":24000,"species":35});
        let populated: AppState = serde_json::from_value(expected.clone()).unwrap();
        let directory = tempdir().unwrap();
        let exports = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.save_at(&populated, now(28)).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), populated);
        let export = exports.path().join("trade-midcast.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let backup = parse_backup(&fs::read(export).unwrap()).unwrap();
        assert_eq!(backup.backup_version, 1);
        assert_eq!(backup.state, populated);
        store.restore_at(&backup.state, now(29)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap().unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn v6_requires_permanent_unlock_count_but_preserves_independent_unlock_history() {
        let good = populated_v6();
        for count in [1, 40] {
            let mut value = good.clone();
            value["games"]["garden"]["unlockedSpecies"] = serde_json::json!(count);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_ok());
        }
        for invalid in [
            serde_json::json!(0),
            serde_json::json!(41),
            serde_json::json!(1.5),
            serde_json::json!("1"),
        ] {
            let mut value = good.clone();
            value["games"]["garden"]["unlockedSpecies"] = invalid;
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err());
        }
        let mut missing = good;
        missing["games"]["garden"]
            .as_object_mut()
            .unwrap()
            .remove("unlockedSpecies");
        assert!(parse_backup(&serde_json::to_vec(&backup_value(missing)).unwrap()).is_err());
    }

    #[test]
    fn v3_disk_migration_preserves_all_three_games_and_exact_original_once() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let previous = populated_v3();
        let original = format!("{}\r\n", serde_json::to_string_pretty(&previous).unwrap());
        fs::write(&path, &original).unwrap();
        let migrated = store.load().unwrap().unwrap();
        let mut expected = previous;
        add_new_games(&mut expected);
        expected["games"]["garden"]["unlockedSpecies"] = serde_json::json!(40);
        assert_eq!(serde_json::to_value(&migrated).unwrap(), expected);
        assert_eq!(store.load().unwrap().unwrap(), migrated);
        let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(fs::read(&snapshots[0]).unwrap(), original.as_bytes());
    }

    #[test]
    fn v2_v3_garden_migration_retains_each_source_of_permanent_unlocks() {
        for version in [2, 3] {
            for (harvest_index, count, plant_species, expected_unlocks) in [
                (0, 0, None, 1),
                (0, 4, None, 1),
                (0, 5, None, 2),
                (10, 1, None, 11),
                (10, 5, None, 12),
                (0, 0, Some(20), 21),
                (39, 5, None, 40),
            ] {
                let mut previous = if version == 2 {
                    populated_v2()
                } else {
                    populated_v3()
                };
                let garden = &mut previous["games"]["garden"];
                garden["harvested"] = serde_json::json!(vec![0; 40]);
                garden["harvested"][harvest_index] = serde_json::json!(count);
                garden["totalHarvests"] = serde_json::json!(count);
                garden["pots"] = serde_json::json!([null, null, null]);
                if let Some(species) = plant_species {
                    garden["pots"][1] = serde_json::json!({
                        "species": species, "plantedAt": 1000, "watered": true
                    });
                }
                let migrated =
                    parse_backup(&serde_json::to_vec(&backup_value(previous.clone())).unwrap())
                        .unwrap()
                        .state;
                assert_eq!(migrated.games.garden.unlocked_species, expected_unlocks);
                let mut migrated_garden = serde_json::to_value(&migrated.games.garden).unwrap();
                migrated_garden
                    .as_object_mut()
                    .unwrap()
                    .remove("unlockedSpecies");
                assert_eq!(migrated_garden, previous["games"]["garden"]);
            }
        }
    }

    #[test]
    fn v3_migration_snapshot_failure_preserves_original() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = serde_json::to_vec_pretty(&populated_v3()).unwrap();
        fs::write(&path, &original).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.load().is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn shared_v4_frontend_fixture_migrates_without_losing_any_existing_game() {
        let fixture = include_bytes!("../../tests/fixtures/phase-four.cornerbits");
        let mut expected: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        add_new_games(&mut expected["state"]);
        let backup = parse_backup(fixture).unwrap();
        assert_eq!(backup.state.schema_version, 6);
        assert_eq!(backup.state.games.garden.unlocked_species, 1);
        assert_eq!(
            serde_json::to_value(&backup.state).unwrap(),
            expected["state"]
        );
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let previous: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        let original = serde_json::to_vec_pretty(&previous["state"]).unwrap();
        fs::write(&path, &original).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
        assert_ne!(fs::read(path).unwrap(), original);
        let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert_eq!(fs::read(&snapshots[0]).unwrap(), original);
        let exported = export_directory.path().join("shared-v4.cornerbits");
        store.export_to(&exported, now(28)).unwrap();
        assert_eq!(
            parse_backup(&fs::read(exported).unwrap()).unwrap().state,
            backup.state
        );
        store.restore_at(&backup.state, now(29)).unwrap();
        assert_eq!(store.load().unwrap().unwrap(), backup.state);
    }

    #[test]
    fn v2_disk_migration_preserves_games_and_snapshots_exact_bytes_once() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let legacy = populated_v2();
        let original = format!("{}\r\n", serde_json::to_string_pretty(&legacy).unwrap());
        fs::write(&path, &original).unwrap();
        let migrated = store.load().unwrap().unwrap();
        let value = serde_json::to_value(&migrated).unwrap();
        assert_eq!(value["schemaVersion"], 6);
        for key in ["revision", "updatedAt", "settings"] {
            assert_eq!(value[key], legacy[key]);
        }
        assert_eq!(value["games"]["mine"], legacy["games"]["mine"]);
        let mut expected_garden = legacy["games"]["garden"].clone();
        expected_garden["unlockedSpecies"] = serde_json::json!(40);
        assert_eq!(value["games"]["garden"], expected_garden);
        assert_eq!(value["games"]["circuit"]["stage"], 1);
        assert_eq!(value["games"]["circuit"]["turns"], 0);
        assert_eq!(
            value["games"]["circuit"]["records"],
            serde_json::json!(vec![0; 300])
        );
        assert_eq!(value["games"]["circuit"]["totalClears"], 0);
        assert_eq!(store.load().unwrap().unwrap(), migrated);
        assert_eq!(
            serde_json::from_slice::<AppState>(&fs::read(path).unwrap()).unwrap(),
            migrated
        );
        let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert!(snapshots[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("pre-migration-"));
        assert_eq!(fs::read(&snapshots[0]).unwrap(), original.as_bytes());
    }

    #[test]
    fn v2_migration_snapshot_failure_preserves_original() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        let original = serde_json::to_vec_pretty(&populated_v2()).unwrap();
        fs::write(&path, &original).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.load().is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn v6_roundtrips_all_populated_games_through_save_export_and_restore() {
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let expected = populated_v6();
        let populated: AppState = serde_json::from_value(expected.clone()).unwrap();
        populated.validate().unwrap();
        store.save_at(&populated, now(28)).unwrap();
        let export = export_directory.path().join("v3.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let restored = parse_backup(read_backup_file(&export).unwrap().as_bytes())
            .unwrap()
            .state;
        store.restore_at(&restored, now(29)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap().unwrap()).unwrap(),
            expected
        );
    }

    #[test]
    fn v6_validates_circuit_boundaries_and_contiguous_records() {
        let good = populated_v6();
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let state: AppState = serde_json::from_value(good.clone()).unwrap();
        store.save_at(&state, now(28)).unwrap();
        let original = fs::read(directory.path().join("state.json")).unwrap();
        assert!(parse_backup(&serde_json::to_vec(&backup_value(good.clone())).unwrap()).is_ok());
        let cases = [
            ("/games/circuit/stage", serde_json::json!(0)),
            ("/games/circuit/stage", serde_json::json!(301)),
            ("/games/circuit/stage", serde_json::json!(3)),
            ("/games/circuit/stage", serde_json::json!(1.5)),
            ("/games/circuit/rotations", serde_json::json!(vec![0; 15])),
            ("/games/circuit/rotations", serde_json::json!(vec![0; 25])),
            ("/games/circuit/rotations/0", serde_json::json!(4)),
            ("/games/circuit/rotations/0", serde_json::json!(-1)),
            ("/games/circuit/rotations/0", serde_json::json!(0.5)),
            ("/games/circuit/turns", serde_json::json!(1000001)),
            ("/games/circuit/turns", serde_json::json!(-1)),
            ("/games/circuit/turns", serde_json::json!("1")),
            ("/games/circuit/records", serde_json::json!(vec![0; 299])),
            ("/games/circuit/records", serde_json::json!(vec![0; 301])),
            ("/games/circuit/records/0", serde_json::json!(1000001)),
            ("/games/circuit/records/0", serde_json::json!(-1)),
            ("/games/circuit/records/2", serde_json::json!(1)),
            ("/games/circuit/totalClears", serde_json::json!(0)),
            (
                "/games/circuit/totalClears",
                serde_json::json!(1000000000001_u64),
            ),
        ];
        for (pointer, invalid) in cases {
            let mut value = good.clone();
            *value.pointer_mut(pointer).unwrap() = invalid;
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value.clone())).unwrap()).is_err(),
                "accepted {pointer}: {value}"
            );
            if let Ok(state) = serde_json::from_value::<AppState>(value) {
                assert!(store.save_at(&state, now(28)).is_err(), "saved {pointer}");
                assert!(
                    store.restore_at(&state, now(28)).is_err(),
                    "restored {pointer}"
                );
            }
        }
        assert_eq!(
            fs::read(directory.path().join("state.json")).unwrap(),
            original
        );
        assert!(!directory.path().join("snapshots").exists());
        for (stage, completed, cells) in [
            (1, 0, 16),
            (150, 149, 16),
            (151, 150, 25),
            (300, 299, 25),
            (300, 300, 25),
        ] {
            let mut value = good.clone();
            let mut records = vec![0; 300];
            records[..completed].fill(1_000_000);
            value["games"]["circuit"] = serde_json::json!({
                "stage": stage, "rotations": vec![3; cells], "turns": 1_000_000,
                "records": records, "totalClears": 1_000_000_000_000_u64
            });
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_ok(),
                "rejected stage {stage} with {completed} completed"
            );
        }
    }

    #[test]
    fn v2_backup_reads_original_text_but_restores_and_exports_v4() {
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let original = serde_json::to_string_pretty(&backup_value(populated_v2())).unwrap();
        let input = export_directory.path().join("v2.cornerbits");
        fs::write(&input, &original).unwrap();
        assert_eq!(read_backup_file(&input).unwrap(), original);
        let populated = parse_backup(original.as_bytes()).unwrap().state;
        let normalized = serde_json::to_value(&populated).unwrap();
        assert_eq!(normalized["schemaVersion"], 6);
        assert_eq!(normalized["games"]["mine"], populated_v2()["games"]["mine"]);
        let mut expected_garden = populated_v2()["games"]["garden"].clone();
        expected_garden["unlockedSpecies"] = serde_json::json!(40);
        assert_eq!(normalized["games"]["garden"], expected_garden);
        assert_eq!(normalized["games"]["circuit"]["totalClears"], 0);
        store.restore_at(&populated, now(28)).unwrap();
        let export = export_directory.path().join("v3.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let restored = parse_backup(read_backup_file(&export).unwrap().as_bytes())
            .unwrap()
            .state;
        store.restore_at(&restored, now(29)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap().unwrap()).unwrap(),
            normalized
        );
    }

    #[test]
    fn shared_v2_frontend_fixture_migrates_without_losing_progress() {
        let fixture = include_bytes!("../../tests/fixtures/phase-two.cornerbits");
        let mut expected: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        add_new_games(&mut expected["state"]);
        expected["state"]["games"]["garden"]["unlockedSpecies"] = serde_json::json!(1);
        expected["state"]["games"]["circuit"] = serde_json::json!({
            "stage": 1, "rotations": [3,2,0,2,0,2,1,1,3,2,1,1,3,1,3,0],
            "turns": 0, "records": vec![0; 300], "totalClears": 0
        });
        let backup = parse_backup(fixture).unwrap();
        assert_eq!(backup.state.schema_version, 6);
        assert_eq!(backup.state.revision, 17);
        assert_eq!(backup.state.games.mine.total_mined, 1);
        assert_eq!(backup.state.games.mine.inventory[0], 1);
        assert_eq!(&backup.state.games.mine.tiles[..3], &[0, 1, 2]);
        assert_eq!(backup.state.games.garden.coins, 15);
        assert_eq!(backup.state.games.garden.total_harvests, 1);
        assert_eq!(backup.state.games.garden.last_observed_at, 2000);
        let plant = backup.state.games.garden.pots[0].as_ref().unwrap();
        assert_eq!(plant.species, 0);
        assert_eq!(plant.planted_at, 1000);
        assert!(plant.watered);
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.restore_at(&backup.state, now(28)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap().unwrap()).unwrap(),
            expected["state"]
        );
        let export = export_directory.path().join("shared-fixture.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let exported = parse_backup(read_backup_file(&export).unwrap().as_bytes()).unwrap();
        assert_eq!(exported.backup_version, 1);
        assert_eq!(
            serde_json::to_value(exported.state).unwrap(),
            expected["state"]
        );
    }

    #[test]
    fn shared_v3_frontend_fixture_restores_and_exports_all_three_games() {
        let fixture = include_bytes!("../../tests/fixtures/phase-three.cornerbits");
        let mut expected: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        add_new_games(&mut expected["state"]);
        expected["state"]["games"]["garden"]["unlockedSpecies"] = serde_json::json!(1);
        let backup = parse_backup(fixture).unwrap();
        assert_eq!(backup.state.schema_version, 6);
        assert_eq!(backup.state.games.mine.total_mined, 1);
        assert_eq!(backup.state.games.garden.total_harvests, 1);
        assert_eq!(backup.state.games.circuit.stage, 151);
        assert_eq!(backup.state.games.circuit.turns, 2);
        assert_eq!(backup.state.games.circuit.rotations.len(), 25);
        assert_eq!(&backup.state.games.circuit.rotations[..4], &[2, 1, 3, 0]);
        assert_eq!(&backup.state.games.circuit.records[..3], &[21, 24, 16]);
        assert_eq!(backup.state.games.circuit.records[149], 22);
        assert_eq!(backup.state.games.circuit.records[150], 0);
        assert_eq!(backup.state.games.circuit.total_clears, 150);
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        store.restore_at(&backup.state, now(28)).unwrap();
        assert_eq!(
            serde_json::to_value(store.load().unwrap().unwrap()).unwrap(),
            expected["state"]
        );
        let export = export_directory.path().join("shared-v3.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        let exported = parse_backup(read_backup_file(&export).unwrap().as_bytes()).unwrap();
        assert_eq!(exported.backup_version, 1);
        assert_eq!(
            serde_json::to_value(exported.state).unwrap(),
            expected["state"]
        );
    }

    #[test]
    fn legacy_load_migrates_once_after_preserving_exact_original_bytes() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        fs::write(&path, legacy_bytes()).unwrap();
        let migrated = store.load().unwrap().unwrap();
        assert_eq!(migrated.schema_version, 6);
        assert_eq!(migrated.revision, 7);
        assert_eq!(migrated.updated_at, "2026-10-28T01:00:00.000Z");
        assert!(migrated.settings.always_on_top && migrated.settings.compact);
        let value = serde_json::to_value(&migrated).unwrap();
        assert_eq!(
            value["games"]["mine"]["tiles"],
            serde_json::json!(vec![2; 25])
        );
        assert_eq!(value["games"]["mine"]["totalMined"], 0);
        assert_eq!(
            value["games"]["garden"]["pots"],
            serde_json::json!([null, null, null])
        );
        assert_eq!(value["games"]["garden"]["lastObservedAt"], 0);
        assert_eq!(
            value["games"]["circuit"],
            serde_json::json!({
                "stage": 1, "rotations": [3,2,0,2,0,2,1,1,3,2,1,1,3,1,3,0],
                "turns": 0, "records": vec![0; 300], "totalClears": 0
            })
        );
        let snapshots: Vec<_> = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(snapshots.len(), 1);
        assert!(snapshots[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("pre-migration-"));
        assert_eq!(fs::read(&snapshots[0]).unwrap(), legacy_bytes());
        assert_eq!(
            serde_json::from_slice::<AppState>(&fs::read(path).unwrap()).unwrap(),
            migrated
        );
        assert_eq!(store.load().unwrap().unwrap(), migrated);
        assert_eq!(
            fs::read_dir(directory.path().join("snapshots"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn legacy_migration_snapshot_failure_preserves_original() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let path = directory.path().join("state.json");
        fs::write(&path, legacy_bytes()).unwrap();
        fs::write(directory.path().join("snapshots"), b"blocked").unwrap();
        assert!(store.load().is_err());
        assert_eq!(fs::read(path).unwrap(), legacy_bytes());
    }

    #[test]
    fn legacy_backup_reads_original_text_but_restores_and_exports_v4() {
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let legacy: serde_json::Value = serde_json::from_slice(legacy_bytes()).unwrap();
        let original = serde_json::to_string_pretty(&backup_value(legacy)).unwrap();
        let input = export_directory.path().join("legacy.cornerbits");
        fs::write(&input, &original).unwrap();
        assert_eq!(read_backup_file(&input).unwrap(), original);
        let normalized = parse_backup(original.as_bytes()).unwrap();
        assert_eq!(normalized.state.schema_version, 6);
        store.restore_at(&normalized.state, now(28)).unwrap();
        let output = export_directory.path().join("normalized.cornerbits");
        store.export_to(&output, now(28)).unwrap();
        let exported: serde_json::Value =
            serde_json::from_slice(&fs::read(output).unwrap()).unwrap();
        assert_eq!(exported["backupVersion"], 1);
        assert_eq!(exported["state"]["schemaVersion"], 6);
        assert_eq!(exported["state"]["games"]["mine"]["depth"], 1);
        assert_eq!(exported["state"]["games"]["circuit"]["stage"], 1);
    }

    #[test]
    fn legacy_disk_export_normalizes_and_preserves_original() {
        let directory = tempdir().unwrap();
        let export_directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        fs::write(directory.path().join("state.json"), legacy_bytes()).unwrap();
        let export = export_directory.path().join("legacy-export.cornerbits");
        store.export_to(&export, now(28)).unwrap();
        assert_eq!(
            parse_backup(&fs::read(export).unwrap())
                .unwrap()
                .state
                .schema_version,
            6
        );
        let snapshot = fs::read_dir(directory.path().join("snapshots"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(snapshot).unwrap(), legacy_bytes());
    }

    #[test]
    fn v4_rejects_invalid_game_fields_and_preserves_existing_state() {
        let directory = tempdir().unwrap();
        let store = Store::new(directory.path().to_owned());
        let good = populated_v6();
        let validated: AppState = serde_json::from_value(good.clone()).unwrap();
        validated.validate().unwrap();
        store.save_at(&validated, now(28)).unwrap();
        let before = fs::read(directory.path().join("state.json")).unwrap();
        let cases = [
            ("/schemaVersion", serde_json::json!(7)),
            ("/revision", serde_json::json!(9007199254740992_u64)),
            ("/games/mine/depth", serde_json::json!(0)),
            ("/games/mine/depth", serde_json::json!(1000001)),
            ("/games/mine/depth", serde_json::json!(1.5)),
            ("/games/mine/pickaxe", serde_json::json!(0)),
            ("/games/mine/pickaxe", serde_json::json!(11)),
            ("/games/mine/coins", serde_json::json!(-1)),
            ("/games/mine/coins", serde_json::json!(1000000000001_u64)),
            ("/games/mine/inventory", serde_json::json!(vec![0; 29])),
            ("/games/mine/inventory/0", serde_json::json!(11)),
            ("/games/mine/collected", serde_json::json!(vec![0; 31])),
            (
                "/games/mine/collected/0",
                serde_json::json!(1000000000001_u64),
            ),
            ("/games/mine/tiles", serde_json::json!(vec![0; 24])),
            ("/games/mine/tiles/0", serde_json::json!(5)),
            ("/games/mine/tiles/0", serde_json::json!(-1)),
            ("/games/mine/totalMined", serde_json::json!(14)),
            ("/games/garden/coins", serde_json::json!(1000000000001_u64)),
            ("/games/garden/unlockedSpecies", serde_json::json!(0)),
            ("/games/garden/unlockedSpecies", serde_json::json!(41)),
            ("/games/garden/pots", serde_json::json!([null, null])),
            (
                "/games/garden/pots",
                serde_json::json!(vec![serde_json::Value::Null; 13]),
            ),
            ("/games/garden/pots/1/species", serde_json::json!(40)),
            ("/games/garden/pots/1/plantedAt", serde_json::json!(2001)),
            ("/games/garden/pots/1/plantedAt", serde_json::json!(-1)),
            ("/games/garden/pots/1/watered", serde_json::json!(1)),
            ("/games/garden/harvested", serde_json::json!(vec![0; 39])),
            (
                "/games/garden/harvested/0",
                serde_json::json!(1000000000001_u64),
            ),
            ("/games/garden/totalHarvests", serde_json::json!(8)),
            (
                "/games/garden/lastObservedAt",
                serde_json::json!(8640000000000001_u64),
            ),
        ];
        for (pointer, invalid) in cases {
            let mut value = good.clone();
            *value.pointer_mut(pointer).unwrap() = invalid;
            let bytes = serde_json::to_vec(&backup_value(value.clone())).unwrap();
            assert!(parse_backup(&bytes).is_err(), "accepted {pointer}: {value}");
            if let Ok(state) = serde_json::from_value::<AppState>(value) {
                assert!(store.save_at(&state, now(28)).is_err(), "saved {pointer}");
                assert!(
                    store.restore_at(&state, now(28)).is_err(),
                    "restored {pointer}"
                );
            }
        }
        assert_eq!(
            fs::read(directory.path().join("state.json")).unwrap(),
            before
        );
        assert!(!directory.path().join("snapshots").exists());
    }

    #[test]
    fn every_game_schema_requires_exact_keys_at_every_level() {
        for good in [
            populated_v2(),
            populated_v3(),
            populated_v4(),
            populated_v5(),
            populated_v6(),
        ] {
            let mut pointers = vec![
                "",
                "/settings",
                "/games",
                "/games/mine",
                "/games/garden",
                "/games/garden/pots/1",
            ];
            if good["schemaVersion"].as_u64().unwrap() >= 3 {
                pointers.push("/games/circuit");
            }
            if good["schemaVersion"].as_u64().unwrap() >= 5 {
                pointers.extend(["/games/fishing", "/games/sword"]);
            }
            for pointer in pointers {
                let fields: Vec<String> = good
                    .pointer(pointer)
                    .unwrap()
                    .as_object()
                    .unwrap()
                    .keys()
                    .cloned()
                    .collect();
                for missing in fields {
                    let mut value = good.clone();
                    value
                        .pointer_mut(pointer)
                        .unwrap()
                        .as_object_mut()
                        .unwrap()
                        .remove(&missing);
                    assert!(
                        parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err(),
                        "accepted missing {pointer}/{missing}"
                    );
                }
                let mut value = good.clone();
                value
                    .pointer_mut(pointer)
                    .unwrap()
                    .as_object_mut()
                    .unwrap()
                    .insert("unexpected".into(), serde_json::json!(true));
                assert!(
                    parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err(),
                    "accepted extra key in {pointer}"
                );
            }
        }
    }

    #[test]
    fn mismatched_version_shapes_and_future_schemas_never_migrate_or_overwrite() {
        let legacy: serde_json::Value = serde_json::from_slice(legacy_bytes()).unwrap();
        for (expected_version, shape) in [
            (1, legacy),
            (2, populated_v2()),
            (3, populated_v3()),
            (4, populated_v4()),
            (5, populated_v5()),
            (6, populated_v6()),
        ] {
            for version in [0, 1, 2, 3, 4, 5, 6, 7] {
                if version == expected_version {
                    continue;
                }
                let mut invalid = shape.clone();
                invalid["schemaVersion"] = serde_json::json!(version);
                let original = serde_json::to_vec_pretty(&invalid).unwrap();
                assert!(
                    parse_backup(&serde_json::to_vec(&backup_value(invalid.clone())).unwrap())
                        .is_err(),
                    "accepted shape {expected_version} as version {version}"
                );
                let directory = tempdir().unwrap();
                let store = Store::new(directory.path().to_owned());
                let path = directory.path().join("state.json");
                fs::write(&path, &original).unwrap();
                assert!(store.load().is_err());
                assert_eq!(fs::read(&path).unwrap(), original);
                assert!(!directory.path().join("snapshots").exists());
                if let Ok(state) = serde_json::from_value::<AppState>(invalid) {
                    assert!(store.save_at(&state, now(28)).is_err());
                    assert!(store.restore_at(&state, now(28)).is_err());
                    assert_eq!(fs::read(path).unwrap(), original);
                }
            }
        }
    }

    #[test]
    fn state_and_backup_timestamps_follow_the_frontend_iso_contract() {
        for invalid in [
            "2026-10-28t01:00:00Z",
            "2026-10-28T01:00:00z",
            "2026-10-28 01:00:00Z",
            "2026-10-28T01:00:60Z",
            "2026-10-28T01:00:00.1234567890Z",
            "2026-10-28T01:00:00.Z",
            "2026-10-28T01:00:00+24:00",
        ] {
            let mut state = populated_v2();
            state["updatedAt"] = serde_json::json!(invalid);
            assert!(
                parse_backup(&serde_json::to_vec(&backup_value(state)).unwrap()).is_err(),
                "accepted state timestamp {invalid}"
            );
            let mut backup = backup_value(populated_v2());
            backup["exportedAt"] = serde_json::json!(invalid);
            assert!(
                parse_backup(&serde_json::to_vec(&backup).unwrap()).is_err(),
                "accepted backup timestamp {invalid}"
            );
        }
        for valid in [
            "2026-10-28T01:00:00Z",
            "2026-10-28T01:00:00.123456789+09:00",
        ] {
            let mut state = populated_v2();
            state["updatedAt"] = serde_json::json!(valid);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(state)).unwrap()).is_ok());
        }
    }

    #[test]
    fn only_exact_legacy_state_is_migrated_and_ipc_requires_v6() {
        let legacy: serde_json::Value = serde_json::from_slice(legacy_bytes()).unwrap();
        assert!(serde_json::from_value::<AppState>(legacy.clone()).is_err());
        assert!(serde_json::from_value::<AppState>(populated_v2()).is_err());
        assert!(serde_json::from_value::<AppState>(populated_v3()).is_err());
        assert!(serde_json::from_value::<AppState>(populated_v4()).is_err());
        assert!(serde_json::from_value::<AppState>(populated_v5()).is_err());
        for pointer in ["", "/settings"] {
            let fields: Vec<String> = legacy
                .pointer(pointer)
                .unwrap()
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect();
            for missing in fields {
                let mut value = legacy.clone();
                value
                    .pointer_mut(pointer)
                    .unwrap()
                    .as_object_mut()
                    .unwrap()
                    .remove(&missing);
                assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err());
            }
            let mut value = legacy.clone();
            value
                .pointer_mut(pointer)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert("unexpected".into(), serde_json::json!(true));
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err());
        }
        let mut disguised = populated_v6();
        disguised["schemaVersion"] = serde_json::json!(1);
        let state: AppState = serde_json::from_value(disguised.clone()).unwrap();
        assert!(state.validate().is_err());
        assert!(parse_backup(&serde_json::to_vec(&backup_value(disguised)).unwrap()).is_err());
    }

    #[test]
    fn v4_accepts_documented_numeric_and_collection_boundaries() {
        let mut value = populated_v6();
        value["revision"] = serde_json::json!(9007199254740991_u64);
        value["games"]["mine"]["depth"] = serde_json::json!(1000000);
        value["games"]["mine"]["pickaxe"] = serde_json::json!(10);
        value["games"]["mine"]["coins"] = serde_json::json!(1000000000000_u64);
        value["games"]["mine"]["tiles"] = serde_json::json!(vec![20; 25]);
        value["games"]["mine"]["inventory"] = serde_json::json!(vec![0; 30]);
        value["games"]["mine"]["collected"] = serde_json::json!(vec![0; 30]);
        value["games"]["mine"]["collected"][29] = serde_json::json!(1000000000000_u64);
        value["games"]["mine"]["totalMined"] = serde_json::json!(1000000000000_u64);
        value["games"]["garden"]["coins"] = serde_json::json!(1000000000000_u64);
        value["games"]["garden"]["harvested"] = serde_json::json!(vec![0; 40]);
        value["games"]["garden"]["harvested"][39] = serde_json::json!(1000000000000_u64);
        value["games"]["garden"]["totalHarvests"] = serde_json::json!(1000000000000_u64);
        value["games"]["garden"]["lastObservedAt"] = serde_json::json!(8640000000000000_u64);
        value["games"]["garden"]["pots"] = serde_json::json!(vec![
            serde_json::json!({
                "species":39, "plantedAt":8640000000000000_u64, "watered":true
            });
            12
        ]);
        let state: AppState = serde_json::from_value(value.clone()).unwrap();
        state.validate().unwrap();
        assert_eq!(
            serde_json::to_value(
                parse_backup(&serde_json::to_vec(&backup_value(value.clone())).unwrap())
                    .unwrap()
                    .state
            )
            .unwrap(),
            value
        );
    }

    #[test]
    fn v4_rejects_sum_overflow_and_accepts_integral_json_numbers() {
        let good = populated_v6();
        for game in ["mine", "garden"] {
            let mut value = good.clone();
            let (counts, total) = if game == "mine" {
                ("collected", "totalMined")
            } else {
                ("harvested", "totalHarvests")
            };
            value["games"][game][counts][0] = serde_json::json!(1000000000000_u64);
            value["games"][game][total] = serde_json::json!(1000000000000_u64);
            assert!(parse_backup(&serde_json::to_vec(&backup_value(value)).unwrap()).is_err());
        }
        let text = serde_json::to_string(&backup_value(good))
            .unwrap()
            .replace("\"depth\":101", "\"depth\":101.0")
            .replace("\"coins\":234", "\"coins\":2.34e2");
        let parsed = parse_backup(text.as_bytes()).unwrap();
        assert_eq!(
            serde_json::to_value(parsed.state).unwrap()["games"]["mine"]["coins"],
            234
        );
    }

    #[test]
    fn rejects_future_schema_invalid_timestamp_and_unsafe_revision() {
        let mut value = state(0);
        value.schema_version = 7;
        assert!(value.validate().is_err());
        value.schema_version = 6;
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
        invalid.schema_version = 4;
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
        invalid.schema_version = 4;
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
