// Local-only logging. NO external telemetry — events append to a single file
// under the OS log dir (macOS: ~/Library/Logs/com.bezier.app/bezier.log).
// Two writers feed it: the Rust panic hook (native crashes) and the `app_log`
// command (front-end error boundaries / global handlers, see src/lib/log.ts).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Caches the resolved log-file path so the command and panic hook share it.
#[derive(Default)]
pub struct LogState {
    pub file: Mutex<Option<PathBuf>>,
}

/// Rotate (truncate to one backup) once the log passes this size.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024; // 2 MiB

/// Whether a log of `len` bytes should rotate before the next append.
fn should_rotate(len: u64) -> bool {
    len > MAX_LOG_BYTES
}

/// UTC timestamp without pulling in a formatting feature/crate.
fn now_stamp() -> String {
    let t = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        t.year(),
        u8::from(t.month()),
        t.day(),
        t.hour(),
        t.minute(),
        t.second()
    )
}

/// Resolve (and create) `<app_log_dir>/bezier.log`.
pub fn resolve_log_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("log dir create {}: {e}", dir.display()))?;
    }
    Ok(dir.join("bezier.log"))
}

/// Append one line to the log, rotating to `bezier.log.1` if it grew too large.
/// Best-effort and single-line (newlines collapsed) so events stay grep-able.
pub fn append_line(path: &PathBuf, level: &str, message: &str) -> Result<(), String> {
    if let Ok(meta) = fs::metadata(path) {
        if should_rotate(meta.len()) {
            let _ = fs::rename(path, path.with_extension("log.1"));
        }
    }
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open log {}: {e}", path.display()))?;
    let flat = message.replace('\n', " ⏎ ");
    writeln!(f, "{} [{}] {}", now_stamp(), level, flat).map_err(|e| format!("write log: {e}"))
}

/// Install a panic hook that also appends panics to the log file (the default
/// stderr hook still runs). `file` is captured so the hook needs no AppHandle.
pub fn install_panic_hook(file: PathBuf) {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic>".to_string());
        let _ = append_line(&file, "panic", &format!("at {location}: {payload}"));
        prev(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_log(name: &str) -> PathBuf {
        let p =
            std::env::temp_dir().join(format!("bezier-log-test-{}-{name}.log", std::process::id()));
        let _ = fs::remove_file(&p);
        p
    }

    #[test]
    fn append_line_writes_single_grepable_line() {
        let path = temp_log("append");
        append_line(&path, "error", "boom\nsecond line").expect("append");
        let body = fs::read_to_string(&path).expect("read");
        // Multi-line messages collapse so each event is one grep-able line.
        assert_eq!(body.lines().count(), 1);
        assert!(body.contains("[error]"));
        assert!(body.contains("boom"));
        assert!(!body.contains("\nsecond line"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_line_accumulates() {
        let path = temp_log("accumulate");
        append_line(&path, "info", "first").expect("append");
        append_line(&path, "info", "second").expect("append");
        let body = fs::read_to_string(&path).expect("read");
        assert_eq!(body.lines().count(), 2);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn rotation_threshold() {
        assert!(!should_rotate(0));
        assert!(!should_rotate(MAX_LOG_BYTES));
        assert!(should_rotate(MAX_LOG_BYTES + 1));
    }
}
