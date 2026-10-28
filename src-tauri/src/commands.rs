use crate::storage::{read_backup_file, AppState, Store};
use chrono::Utc;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub struct NativeStore(pub Mutex<Store>);

fn locked(store: &NativeStore) -> Result<std::sync::MutexGuard<'_, Store>, String> {
    store
        .0
        .lock()
        .map_err(|_| "저장 작업을 다시 시작하려면 앱을 재실행해 주세요.".into())
}

#[tauri::command]
pub async fn load_state(store: State<'_, NativeStore>) -> Result<Option<AppState>, String> {
    locked(&store)?.load()
}

#[tauri::command]
pub async fn save_state(state: AppState, store: State<'_, NativeStore>) -> Result<(), String> {
    locked(&store)?.save_at(&state, Utc::now())
}

#[tauri::command]
pub async fn restore_state(state: AppState, store: State<'_, NativeStore>) -> Result<(), String> {
    locked(&store)?.restore_at(&state, Utc::now())
}

#[tauri::command]
pub async fn export_backup(
    app: AppHandle,
    store: State<'_, NativeStore>,
) -> Result<Option<String>, String> {
    // Paths only originate from native user dialogs; IPC never accepts a filesystem path.
    let selected = app
        .dialog()
        .file()
        .set_title("CornerBits 백업 내보내기")
        .add_filter("CornerBits 백업", &["cornerbits"])
        .set_file_name(format!(
            "CornerBits_Backup_{}.cornerbits",
            Utc::now().format("%Y-%m-%d")
        ))
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "백업 경로가 올바르지 않습니다.".to_owned())?;
    locked(&store)?.export_to(&path, Utc::now())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn read_backup(app: AppHandle) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("CornerBits 백업 불러오기")
        .add_filter("CornerBits 백업", &["cornerbits", "json"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "백업 경로가 올바르지 않습니다.".to_owned())?;
    read_backup_file(&path).map(Some)
}
