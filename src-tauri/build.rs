use std::{env, fs, path::PathBuf};

fn main() {
    // Windows requires an ICO resource. Build this plain monochrome mark into
    // OUT_DIR, keeping generated binary artwork out of the source tree.
    let path = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR")).join("cornerbits.ico");
    let mut icon = Vec::new();
    icon.extend_from_slice(&[0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0]);
    icon.extend_from_slice(&(40u32 + 16 * 16 * 4 + 16 * 4).to_le_bytes());
    icon.extend_from_slice(&22u32.to_le_bytes());
    icon.extend_from_slice(&40u32.to_le_bytes());
    icon.extend_from_slice(&16i32.to_le_bytes());
    icon.extend_from_slice(&32i32.to_le_bytes());
    icon.extend_from_slice(&1u16.to_le_bytes());
    icon.extend_from_slice(&32u16.to_le_bytes());
    icon.extend_from_slice(&[0; 24]);
    for y in (0..16).rev() {
        for x in 0..16 {
            let filled = (3..13).contains(&x) && (3..13).contains(&y) && (x < 6 || y > 9);
            icon.extend_from_slice(if filled {
                &[48, 48, 48, 255]
            } else {
                &[0, 0, 0, 0]
            });
        }
    }
    icon.extend_from_slice(&[0; 16 * 4]);
    fs::write(&path, icon).expect("write build icon");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new().window_icon_path(path)),
    )
    .expect("build CornerBits native resources");
}
