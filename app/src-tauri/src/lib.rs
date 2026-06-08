use serde::Serialize;

/// Mirrors the TS `FileEntry` (src/lib/ipc.ts) EXACTLY.
/// `rename_all = "camelCase"` makes `is_dir` serialize as `isDir` over IPC.
/// A casing mismatch silently yields `undefined` on the JS side, so this
/// must stay in sync with the frozen contract.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    /// "md" | "mdx" | "yaml" | ""
    pub ext: String,
}

// ---- Custom file-I/O commands (no capability grants required) ----
// These are COMPILING STUBS. Downstream agents implement the real logic.

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    // STUB: return empty listing. Real impl reads `path` immediate children.
    let _ = path;
    Ok(Vec::new())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    // STUB: return empty contents. Real impl reads UTF-8 file at `path`.
    let _ = path;
    Ok(String::new())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    // STUB: no-op. Real impl MUST canonicalize and assert the target path is
    // inside the chosen workspace root (prevent path traversal) before writing.
    let _ = (path, contents);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_dir, read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
