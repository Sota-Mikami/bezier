use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::Emitter;

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

/// Directory entry names that are never surfaced to the UI.
const SKIP_DIRS: &[&str] = &["node_modules", "target", ".next", "out"];

/// Normalize a lowercased extension to the contract's `ext` values.
/// Returns `Some` for the file extensions we surface, `None` otherwise.
fn classify_ext(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "md" => Some("md"),
        "mdx" => Some("mdx"),
        "yaml" | "yml" => Some("yaml"),
        _ => None,
    }
}

/// Reject any path that contains a `..` (ParentDir) component. Used to prevent
/// path traversal before touching the filesystem. For v0.1 the picker only
/// hands us absolute paths under the opened workspace root; this guard ensures
/// a caller cannot smuggle a `..` segment to escape it.
fn reject_traversal(path: &Path) -> Result<(), String> {
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(format!(
            "refusing path containing '..' (traversal): {}",
            path.display()
        ));
    }
    Ok(())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    reject_traversal(dir)?;

    let read = fs::read_dir(dir).map_err(|e| format!("list_dir {path}: {e}"))?;

    let mut entries: Vec<FileEntry> = Vec::new();
    for item in read {
        let item = item.map_err(|e| format!("list_dir entry in {path}: {e}"))?;
        let name = item.file_name().to_string_lossy().into_owned();

        // Skip dotfiles/dotdirs and known noise directories.
        if name.starts_with('.') {
            continue;
        }

        let file_type = item
            .file_type()
            .map_err(|e| format!("list_dir file_type {name}: {e}"))?;
        let entry_path = item.path().to_string_lossy().into_owned();

        if file_type.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            entries.push(FileEntry {
                path: entry_path,
                name,
                is_dir: true,
                ext: String::new(),
            });
        } else if file_type.is_file() {
            let ext = item
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .and_then(classify_ext);
            if let Some(ext) = ext {
                entries.push(FileEntry {
                    path: entry_path,
                    name,
                    is_dir: false,
                    ext: ext.to_string(),
                });
            }
        }
    }

    // Stable, predictable ordering: directories first, then by name.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    reject_traversal(Path::new(&path))?;
    fs::read_to_string(&path).map_err(|e| format!("read_file {path}: {e}"))
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    reject_traversal(target)?;

    // The target file may not exist yet (new doc), so canonicalize the PARENT
    // directory and re-attach the file name. Canonicalization resolves symlinks
    // and any residual relative segments; combined with the `..` guard above the
    // resulting path cannot escape the directory the picker handed us.
    let parent = target
        .parent()
        .ok_or_else(|| format!("write_file {path}: path has no parent directory"))?;
    // Create the parent tree if it does not exist yet (e.g. the workspace SoR
    // dir <root>/.continuum on first save). `target` already passed the `..`
    // traversal guard above, so every parent component is safe to materialize.
    // canonicalize (below) then resolves symlinks and validates the real path.
    if !parent.as_os_str().is_empty() && !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("write_file {path}: cannot create parent dir: {e}"))?;
    }
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|e| format!("write_file {path}: cannot resolve parent dir: {e}"))?;
    let file_name = target
        .file_name()
        .ok_or_else(|| format!("write_file {path}: path has no file name"))?;
    let mut resolved: PathBuf = canonical_parent;
    resolved.push(file_name);

    // Defense in depth: the canonicalized parent must not have produced a `..`.
    reject_traversal(&resolved)?;

    fs::write(&resolved, contents).map_err(|e| format!("write_file {path}: {e}"))
}

// ============================================================================
// v0.2 — embedded terminal (portable-pty) + agent delegation backend.
//
// SCAFFOLD ONLY. These are compiling stubs that freeze the IPC contract mirrored
// in src/lib/pty.ts. The actual pty spawn + reader thread (emitting "pty://data"
// / "pty://exit") is a TODO for the v0.2 terminal feature work. Do NOT change the
// command names, parameter names, or struct field shapes — the TS bindings and
// event contract depend on them. Structs use `rename_all = "camelCase"` so the
// snake_case Rust fields match the camelCase TS fields, exactly like FileEntry.
// ============================================================================

/// Mirrors the TS `PtySpawnOpts` (src/lib/pty.ts). Sent as `{ opts }` from JS.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnOpts {
    /// Working directory the child is launched in (workspace root).
    pub cwd: String,
    /// Executable to run (user shell, or an agent like "claude").
    pub cmd: String,
    /// Arguments passed to `cmd`.
    #[serde(default)]
    pub args: Vec<String>,
    /// Initial terminal width in columns.
    pub cols: u16,
    /// Initial terminal height in rows.
    pub rows: u16,
}

/// One live pty-backed session, held in tauri-managed state keyed by pty id.
///
/// `writer` feeds the child's stdin, `master` stays alive to allow resize and to
/// hold the pty fd open, and `killer` terminates the child on teardown. The
/// actual `Child` handle is moved into the reader thread (it owns `wait()` so it
/// can report the exit code on EOF); `killer` is a cloned handle that lets
/// `pty_kill` terminate the process without sharing the child across threads.
pub struct Session {
    /// Writer into the pty master (the child's stdin).
    pub writer: Box<dyn Write + Send>,
    /// The pty master; kept alive for resize and to hold the pty open.
    pub master: Box<dyn MasterPty + Send>,
    /// Cloned killer handle; used to terminate the child on teardown.
    pub killer: Box<dyn ChildKiller + Send + Sync>,
}

/// Payload for the `pty://data` event. camelCase to match the frozen TS
/// contract in src/lib/pty.ts (`onPtyData` receives `{ id, chunk }`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyDataPayload {
    id: String,
    chunk: String,
}

/// Payload for the `pty://exit` event (`onPtyExit` receives `{ id, code }`).
/// `code` is `null` when the exit status could not be retrieved.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitPayload {
    id: String,
    code: Option<i32>,
}

/// Tauri-managed registry of live pty sessions (id -> Session).
#[derive(Default)]
pub struct PtyState {
    pub sessions: Mutex<HashMap<String, Session>>,
}

/// Spawn a pty-backed child process. Returns the new session id (uuid).
///
/// Opens a pty via `native_pty_system()`, spawns `opts.cmd`/`opts.args` in
/// `opts.cwd` at `opts.cols`x`opts.rows`, stores the live `Session` in
/// `PtyState`, and starts a reader thread that emits `pty://data` for each chunk
/// of output and `pty://exit` once the child closes the pty.
#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    opts: PtySpawnOpts,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: opts.rows,
        cols: opts.cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("pty_spawn openpty: {e}"))?;

    let mut builder = CommandBuilder::new(&opts.cmd);
    builder.args(&opts.args);
    builder.cwd(&opts.cwd);

    // Spawn the child against the slave side of the pty.
    let mut child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| format!("pty_spawn spawn {}: {e}", opts.cmd))?;
    // Drop the slave handle in the parent so the master sees EOF once the child
    // exits (otherwise the reader would block forever holding the slave open).
    drop(pair.slave);

    // Cloned killer for teardown; the real child moves into the reader thread so
    // it can `wait()` for the exit code without sharing it across threads.
    let killer = child.clone_killer();

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("pty_spawn take_writer: {e}"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("pty_spawn clone_reader: {e}"))?;

    let id = uuid::Uuid::new_v4().to_string();

    // Reader thread: stream output as `pty://data`, then `pty://exit` on EOF.
    let app_handle = app.clone();
    let thread_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF: child closed the pty.
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app_handle.emit(
                        "pty://data",
                        PtyDataPayload {
                            id: thread_id.clone(),
                            chunk,
                        },
                    );
                }
                Err(_) => break, // read error: treat as terminated.
            }
        }
        let code = child.wait().ok().map(|status| status.exit_code() as i32);
        let _ = app_handle.emit(
            "pty://exit",
            PtyExitPayload {
                id: thread_id.clone(),
                code,
            },
        );
    });

    let session = Session {
        writer,
        master: pair.master,
        killer,
    };
    state
        .sessions
        .lock()
        .map_err(|e| format!("pty_spawn lock: {e}"))?
        .insert(id.clone(), session);

    Ok(id)
}

/// Write raw input to the pty's stdin.
#[tauri::command]
fn pty_write(state: tauri::State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("pty_write lock: {e}"))?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("pty_write: no session {id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("pty_write {id}: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("pty_write flush {id}: {e}"))?;
    Ok(())
}

/// Resize the pty window.
#[tauri::command]
fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("pty_resize lock: {e}"))?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("pty_resize: no session {id}"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("pty_resize {id}: {e}"))?;
    Ok(())
}

/// Kill the child and drop the session. Idempotent: an unknown id is a no-op.
#[tauri::command]
fn pty_kill(state: tauri::State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("pty_kill lock: {e}"))?;
    if let Some(mut session) = sessions.remove(&id) {
        // Best-effort kill; the reader thread will emit `pty://exit` on EOF.
        let _ = session.killer.kill();
    }
    Ok(())
}

/// Probe whether `name` resolves to an executable on PATH (agent detection).
/// Implemented for real (no portable-pty needed): scans `$PATH` entries.
#[tauri::command]
fn command_exists(name: String) -> Result<bool, String> {
    if name.is_empty() {
        return Ok(false);
    }
    // An explicit path is checked directly rather than searched on PATH.
    let candidate = Path::new(&name);
    if candidate.is_absolute() || name.contains('/') {
        return Ok(is_executable(candidate));
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        if is_executable(&dir.join(&name)) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// True if `p` is a regular file with an executable bit set (unix) / a file
/// (other platforms).
fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        match std::fs::metadata(p) {
            Ok(m) => m.is_file() && (m.permissions().mode() & 0o111 != 0),
            Err(_) => false,
        }
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

// ============================================================================
// v0.5 slice 2 — git worktree / diff commands (the implementation loop).
//
// Thin shells over the `git` CLI via std::process::Command (simplest + robust;
// no libgit2 build dependency). Every path argument is checked with
// `reject_traversal` before being handed to git. Each command returns
// `Result<T, String>` with git's stderr surfaced on failure so the TS layer can
// show a clear message. Mirrored by src/lib/git.ts (Tauri maps the camelCase JS
// arg keys to these snake_case params automatically).
// ============================================================================

/// Run `git` with `args`, returning stdout on success or an Err string that
/// includes stderr (and any stdout) on failure. Used by the commands below.
fn git_run(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git {args:?}: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let detail = format!("{stderr}{stdout}");
        return Err(format!(
            "git {} failed: {}",
            args.join(" "),
            detail.trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// True if `path` is inside a git work tree.
#[tauri::command]
fn git_is_repo(path: String) -> Result<bool, String> {
    reject_traversal(Path::new(&path))?;
    let out = std::process::Command::new("git")
        .args(["-C", &path, "rev-parse", "--is-inside-work-tree"])
        .output()
        .map_err(|e| format!("git_is_repo {path}: {e}"))?;
    // A non-repo dir exits non-zero; treat that as `false`, not an error.
    Ok(out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true")
}

/// Create `branch` off the repo's current HEAD and add a worktree at
/// `worktree_path`. If `branch` already exists, attach it to the new worktree
/// instead of failing. A pre-existing `worktree_path` is surfaced as an Err.
#[tauri::command]
fn git_worktree_add(repo: String, branch: String, worktree_path: String) -> Result<(), String> {
    reject_traversal(Path::new(&repo))?;
    reject_traversal(Path::new(&worktree_path))?;

    // Fast path: create a fresh branch off HEAD and check it out in the worktree.
    let out = std::process::Command::new("git")
        .args([
            "-C",
            &repo,
            "worktree",
            "add",
            "-b",
            &branch,
            &worktree_path,
            "HEAD",
        ])
        .output()
        .map_err(|e| format!("git_worktree_add {repo}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
    // Branch already exists -> attach it (the worktree path must still be free).
    if stderr.contains("already exists") && stderr.contains("branch named") {
        let out2 = std::process::Command::new("git")
            .args(["-C", &repo, "worktree", "add", &worktree_path, &branch])
            .output()
            .map_err(|e| format!("git_worktree_add(attach) {repo}: {e}"))?;
        if out2.status.success() {
            return Ok(());
        }
        return Err(format!(
            "git worktree add (existing branch {branch}) failed: {}",
            String::from_utf8_lossy(&out2.stderr).trim()
        ));
    }
    Err(format!("git worktree add failed: {}", stderr.trim()))
}

/// Diff of uncommitted changes in `worktree_path` (what the agent touched).
/// Untracked files are first marked intent-to-add (`add -A -N`) so they appear
/// in the diff as additions, matching what an Accept will commit.
#[tauri::command]
fn git_diff(worktree_path: String) -> Result<String, String> {
    reject_traversal(Path::new(&worktree_path))?;
    // Intent-to-add untracked files so `git diff` includes them. Best-effort:
    // a failure here (e.g. nothing to add) must not abort the diff.
    let _ = std::process::Command::new("git")
        .args(["-C", &worktree_path, "add", "-A", "-N"])
        .output();
    git_run(&["-C", &worktree_path, "diff"])
}

/// Porcelain status of `worktree_path` (changed-file list, machine-stable).
#[tauri::command]
fn git_status(worktree_path: String) -> Result<String, String> {
    reject_traversal(Path::new(&worktree_path))?;
    git_run(&["-C", &worktree_path, "status", "--porcelain"])
}

/// Stage everything and commit in `worktree_path`. Returns the new commit SHA.
/// A "nothing to commit" condition surfaces as an Err (the caller decides).
#[tauri::command]
fn git_commit_all(worktree_path: String, message: String) -> Result<String, String> {
    reject_traversal(Path::new(&worktree_path))?;
    git_run(&["-C", &worktree_path, "add", "-A"])?;
    // `-m` with an empty message is rejected by git; guard with a fallback.
    let msg = if message.trim().is_empty() {
        "continuum: implement issue"
    } else {
        message.as_str()
    };
    git_run(&["-C", &worktree_path, "commit", "-m", msg])?;
    let sha = git_run(&["-C", &worktree_path, "rev-parse", "HEAD"])?;
    Ok(sha.trim().to_string())
}

/// Remove the worktree at `worktree_path` (force-discarding its changes).
#[tauri::command]
fn git_worktree_remove(repo: String, worktree_path: String) -> Result<(), String> {
    reject_traversal(Path::new(&repo))?;
    reject_traversal(Path::new(&worktree_path))?;
    git_run(&["-C", &repo, "worktree", "remove", "--force", &worktree_path])?;
    Ok(())
}

/// Delete `branch` from `repo` (force). Used by Discard after the worktree is
/// removed. Idempotent-ish: a missing branch surfaces as an Err the caller may
/// choose to ignore.
#[tauri::command]
fn git_branch_delete(repo: String, branch: String) -> Result<(), String> {
    reject_traversal(Path::new(&repo))?;
    git_run(&["-C", &repo, "branch", "-D", &branch])?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file,
            write_file,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            command_exists,
            git_is_repo,
            git_worktree_add,
            git_diff,
            git_status,
            git_commit_all,
            git_worktree_remove,
            git_branch_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
