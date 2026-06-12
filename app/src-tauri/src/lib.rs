use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

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

/// Recursively remove a file or directory. Guarded: rejects `..` traversal and
/// requires the resolved path to live under a `.continuum` working store, so it
/// can only delete continuum's local issue artifacts — never arbitrary repo
/// files. No-op (Ok) when the path does not exist.
#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    reject_traversal(target)?;
    if !target.exists() {
        return Ok(());
    }
    let canonical =
        fs::canonicalize(target).map_err(|e| format!("remove_path {path}: cannot resolve: {e}"))?;
    reject_traversal(&canonical)?;
    let under_store = canonical
        .components()
        .any(|c| c.as_os_str() == ".continuum");
    if !under_store {
        return Err(format!(
            "refusing to remove path outside a .continuum store: {}",
            canonical.display()
        ));
    }
    if canonical.is_dir() {
        fs::remove_dir_all(&canonical).map_err(|e| format!("remove_path {path}: {e}"))
    } else {
        fs::remove_file(&canonical).map_err(|e| format!("remove_path {path}: {e}"))
    }
}

/// Move/rename a file or directory. Guarded like remove_path: rejects `..` and
/// requires BOTH the source and the destination's parent to live under a
/// `.continuum` working store (so it can only shuffle continuum's own artifacts,
/// e.g. into / out of the trash). Creates the destination's parent tree.
#[tauri::command]
fn move_path(from: String, to: String) -> Result<(), String> {
    let src = Path::new(&from);
    let dst = Path::new(&to);
    reject_traversal(src)?;
    reject_traversal(dst)?;
    if !src.exists() {
        return Err(format!("move_path: source does not exist: {from}"));
    }
    let canon_src =
        fs::canonicalize(src).map_err(|e| format!("move_path resolve from {from}: {e}"))?;
    if !canon_src
        .components()
        .any(|c| c.as_os_str() == ".continuum")
    {
        return Err(format!(
            "refusing to move from outside a .continuum store: {}",
            canon_src.display()
        ));
    }
    let dst_parent = dst
        .parent()
        .ok_or_else(|| format!("move_path: dst has no parent: {to}"))?;
    if !dst_parent.exists() {
        fs::create_dir_all(dst_parent)
            .map_err(|e| format!("move_path create dst parent {to}: {e}"))?;
    }
    let canon_dst_parent = fs::canonicalize(dst_parent)
        .map_err(|e| format!("move_path resolve dst parent {to}: {e}"))?;
    if !canon_dst_parent
        .components()
        .any(|c| c.as_os_str() == ".continuum")
    {
        return Err(format!(
            "refusing to move to outside a .continuum store: {}",
            canon_dst_parent.display()
        ));
    }
    let file_name = dst
        .file_name()
        .ok_or_else(|| format!("move_path: dst has no file name: {to}"))?;
    let mut resolved_dst = canon_dst_parent;
    resolved_dst.push(file_name);
    fs::rename(&canon_src, &resolved_dst)
        .map_err(|e| format!("move_path {from} -> {to}: {e}"))
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
        // Carry buffer for an INCOMPLETE multi-byte UTF-8 sequence at the end of
        // a read. Without it, a Japanese (3-byte) char split across two pty reads
        // would decode to replacement chars (mojibake — e.g. "ら" garbled).
        let mut carry: Vec<u8> = Vec::new();
        let emit_chunk = |chunk: String| {
            let _ = app_handle.emit(
                "pty://data",
                PtyDataPayload {
                    id: thread_id.clone(),
                    chunk,
                },
            );
        };
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF: child closed the pty.
                Ok(n) => {
                    carry.extend_from_slice(&buf[..n]);
                    // Emit the longest VALID UTF-8 prefix; keep an incomplete
                    // trailing sequence in `carry` for the next read. Genuinely
                    // invalid bytes are replaced so they can never stall.
                    loop {
                        match std::str::from_utf8(&carry) {
                            Ok(s) => {
                                if !s.is_empty() {
                                    let chunk = s.to_owned();
                                    carry.clear();
                                    emit_chunk(chunk);
                                }
                                break;
                            }
                            Err(e) => {
                                let valid = e.valid_up_to();
                                match e.error_len() {
                                    // Incomplete tail: emit valid prefix, keep rest.
                                    None => {
                                        if valid > 0 {
                                            let chunk = String::from_utf8_lossy(&carry[..valid])
                                                .into_owned();
                                            carry.drain(..valid);
                                            emit_chunk(chunk);
                                        }
                                        break;
                                    }
                                    // Invalid byte(s) mid-stream: emit valid prefix
                                    // + U+FFFD, drop the bad bytes, keep scanning.
                                    Some(bad) => {
                                        let mut chunk = String::from_utf8_lossy(&carry[..valid])
                                            .into_owned();
                                        chunk.push('\u{FFFD}');
                                        carry.drain(..valid + bad);
                                        emit_chunk(chunk);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => break, // read error: treat as terminated.
            }
        }
        // Flush any trailing incomplete bytes (lossy) on EOF.
        if !carry.is_empty() {
            emit_chunk(String::from_utf8_lossy(&carry).into_owned());
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

/// Resolve `name` to a preferred absolute executable path on PATH, returning ""
/// when not found. Skips shims bundled inside other apps — notably cmux.app,
/// whose `claude` bridges sessions and so cannot replay a prior transcript on
/// `--continue` (the real npm/Homebrew install does). If the ONLY match is such
/// a shim it is returned as a last resort. An explicit path is returned as-is
/// when executable.
#[tauri::command]
fn resolve_command(name: String) -> Result<String, String> {
    if name.is_empty() {
        return Ok(String::new());
    }
    let candidate = Path::new(&name);
    if candidate.is_absolute() || name.contains('/') {
        return Ok(if is_executable(candidate) {
            name
        } else {
            String::new()
        });
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    let mut fallback: Option<String> = None;
    for dir in std::env::split_paths(&path) {
        let p = dir.join(&name);
        if is_executable(&p) {
            let s = p.to_string_lossy().to_string();
            // De-prioritize app-bundled shims; prefer a real CLI install.
            if s.to_lowercase().contains("cmux.app") {
                if fallback.is_none() {
                    fallback = Some(s);
                }
                continue;
            }
            return Ok(s);
        }
    }
    Ok(fallback.unwrap_or_default())
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

// ============================================================================
// v0.5 — merge-safety layer (OPEN-001 / merge-safety-plan).
//
// An Issue branch is cut off `main` at Implement time; meanwhile `main` advances
// (direct work + other Issues), so a later merge can CONFLICT. Accept only
// commits to the branch (main untouched). These commands add: behind/ahead
// visibility, Sync-with-main (resolve conflicts INSIDE the isolated worktree —
// never on main), a non-destructive dry-run conflict check, and a GUARDED
// merge-to-main. All path args are `reject_traversal`-guarded; git's stderr is
// surfaced on failure. Structs use `rename_all = "camelCase"` to match the TS
// bindings (src/lib/git.ts), exactly like FileEntry.
// ============================================================================

/// Run `git` with `args`, returning the raw `Output` (so callers that need the
/// exit CODE — e.g. merge / merge-tree, where 1 means "conflict", not "error" —
/// can branch on it). A spawn failure (git missing) is the only Err.
fn git_output(args: &[&str]) -> Result<std::process::Output, String> {
    std::process::Command::new("git")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git {args:?}: {e}"))
}

/// Resolve the worktree/repo's current branch name (or "HEAD" if detached).
fn current_branch(dir: &str) -> Result<String, String> {
    Ok(git_run(&["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string())
}

/// `git rev-list --count <range>` parsed to a u32.
fn rev_count(dir: &str, range: &str) -> Result<u32, String> {
    git_run(&["-C", dir, "rev-list", "--count", range])?
        .trim()
        .parse::<u32>()
        .map_err(|e| format!("rev-list --count {range}: parse: {e}"))
}

/// How far the worktree's branch is behind/ahead of `base`.
/// `behind` = commits in `base` not in the branch (work the branch is missing);
/// `ahead`  = commits in the branch not in `base` (the branch's own work).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BehindAhead {
    pub behind: u32,
    pub ahead: u32,
}

/// Compute behind/ahead of the worktree's current branch vs `base` (e.g. "main").
/// The worktree shares the main repo's refs, so `base` is reachable. An invalid
/// `base` ref surfaces as a clear Err (rev-list fails).
#[tauri::command]
fn git_behind_ahead(worktree_path: String, base: String) -> Result<BehindAhead, String> {
    reject_traversal(Path::new(&worktree_path))?;
    let wt = worktree_path.as_str();
    let branch = current_branch(wt)?;
    let behind = rev_count(wt, &format!("{branch}..{base}"))?;
    let ahead = rev_count(wt, &format!("{base}..{branch}"))?;
    Ok(BehindAhead { behind, ahead })
}

/// Result of Sync-with-main: clean merge (`ok`) or the conflicted file list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub ok: bool,
    pub conflicts: Vec<String>,
}

/// Merge `base` INTO the worktree's branch (`git -C <wt> merge <base>`), so the
/// branch catches up to main. On a clean merge -> `ok:true`. On CONFLICT ->
/// `ok:false` + the conflicted file list, and the worktree is LEFT in the
/// conflicted state (NOT aborted) so the user/agent resolves it in the worktree
/// terminal, then commits — the conflict never touches main. A non-conflict
/// failure (e.g. local changes would be overwritten) or an invalid `base` ref
/// surfaces as a clear Err.
#[tauri::command]
fn git_sync_main(worktree_path: String, base: String) -> Result<SyncResult, String> {
    reject_traversal(Path::new(&worktree_path))?;
    let wt = worktree_path.as_str();
    // Validate `base` is a real ref up front (clear Err otherwise).
    git_run(&["-C", wt, "rev-parse", "--verify", "--quiet", &base])
        .map_err(|_| format!("base '{base}' is not a valid ref"))?;

    // The worktree may hold UNCOMMITTED agent work — `git merge` refuses to run
    // on a dirty tree ("local changes would be overwritten"). Commit it first as
    // a WIP commit on the branch (those changes belong to the branch anyway, and
    // Accept would commit them too) so the merge can proceed and surface any real
    // conflict for resolution. `--no-verify` skips commit hooks for this internal
    // WIP commit.
    let dirty = !git_run(&["-C", wt, "status", "--porcelain"])?
        .trim()
        .is_empty();
    if dirty {
        git_run(&["-C", wt, "add", "-A"])?;
        git_run(&[
            "-C",
            wt,
            "commit",
            "--no-verify",
            "-m",
            "WIP: before sync with main",
        ])?;
    }

    let out = git_output(&["-C", wt, "merge", "--no-edit", &base])?;
    if out.status.success() {
        return Ok(SyncResult {
            ok: true,
            conflicts: Vec::new(),
        });
    }

    // Merge failed: a conflict leaves unmerged (diff-filter=U) entries. If there
    // are none, it failed for another reason (surface git's message).
    let unmerged = git_run(&["-C", wt, "diff", "--name-only", "--diff-filter=U"])?;
    let conflicts: Vec<String> = unmerged
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    if conflicts.is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "git merge {base} failed: {}",
            format!("{stderr}{stdout}").trim()
        ));
    }
    // Conflicted on purpose — resolve in the worktree, do NOT abort.
    Ok(SyncResult {
        ok: false,
        conflicts,
    })
}

/// Result of the dry-run conflict check.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictCheck {
    pub clean: bool,
    pub files: Vec<String>,
}

/// DRY-RUN: would merging `base` and the worktree's branch conflict? Uses
/// `git merge-tree --write-tree` (git >= 2.38) which computes the merge IN MEMORY
/// — nothing on disk changes. Exit 0 = clean, 1 = conflict (parse the file list),
/// anything else = error (surfaced). `--name-only` makes the conflicted-file
/// section a bare filename per line.
#[tauri::command]
fn git_merge_conflict_check(worktree_path: String, base: String) -> Result<ConflictCheck, String> {
    reject_traversal(Path::new(&worktree_path))?;
    let wt = worktree_path.as_str();
    let branch = current_branch(wt)?;
    let out = git_output(&[
        "-C",
        wt,
        "merge-tree",
        "--write-tree",
        "--name-only",
        &branch,
        &base,
    ])?;
    match out.status.code() {
        Some(0) => Ok(ConflictCheck {
            clean: true,
            files: Vec::new(),
        }),
        Some(1) => {
            // Output: <tree-OID>\n<conflicted filenames...>\n\n<info messages>.
            // Skip the OID line, then take filenames until the blank separator.
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut lines = stdout.lines();
            let _oid = lines.next();
            let files: Vec<String> = lines
                .take_while(|l| !l.trim().is_empty())
                .map(String::from)
                .collect();
            Ok(ConflictCheck {
                clean: false,
                files,
            })
        }
        _ => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(format!("git merge-tree failed: {}", stderr.trim()))
        }
    }
}

/// GUARDED merge of `branch` INTO the MAIN repo's current branch (the explicit,
/// final step on top of Accept). In the main repo working tree, verify:
///   (a) the working tree is clean (`status --porcelain` empty), and
///   (b) `branch` is not behind base AND merges cleanly (dry-run),
/// then `git merge <branch>`. If a guard fails, return a clear Err telling the
/// caller to Sync first / clean the tree — nothing is forced.
#[tauri::command]
fn git_merge_to_main(repo_path: String, branch: String) -> Result<String, String> {
    reject_traversal(Path::new(&repo_path))?;
    let repo = repo_path.as_str();
    // Validate the branch ref first.
    git_run(&["-C", repo, "rev-parse", "--verify", "--quiet", &branch])
        .map_err(|_| format!("branch '{branch}' is not a valid ref"))?;

    // Guard (a): the main working tree must be clean.
    let status = git_run(&["-C", repo, "status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err("working tree not clean — commit or stash changes on main first".to_string());
    }

    // base = the branch we are merging INTO (the repo's current branch, e.g. main).
    let base = current_branch(repo)?;

    // Guard (b1): branch must not be behind base (else: Sync first).
    let behind = rev_count(repo, &format!("{branch}..{base}"))?;
    if behind > 0 {
        return Err(format!(
            "branch is {behind} behind {base} — Sync with main first"
        ));
    }

    // Guard (b2): the merge must be conflict-free (dry-run, touches nothing).
    let check = git_output(&[
        "-C",
        repo,
        "merge-tree",
        "--write-tree",
        "--name-only",
        &base,
        &branch,
    ])?;
    if check.status.code() != Some(0) {
        return Err(format!(
            "branch conflicts with {base} — Sync with main first"
        ));
    }

    // Guards passed: merge into base. With behind=0 this fast-forwards (or is a
    // no-op "Already up to date"); never forced.
    let merged = git_run(&["-C", repo, "merge", "--no-edit", &branch])?;
    Ok(merged.trim().to_string())
}

// ============================================================================
// DEC-015 — "Open PR" finalize path (team-safe default). Instead of touching
// main directly (git_merge_to_main, demoted to a solo opt-in), push the Issue
// branch and open a GitHub PR via `gh` so review / CI / merge happen on the
// platform and `main` is never modified locally. Detection upstream uses
// `command_exists("gh")` + `git_remote_url`. All path args are
// `reject_traversal`-guarded; failures surface git's/gh's stderr.
// ============================================================================

/// origin's remote URL (used to detect "this repo can Open a PR"). Err when the
/// repo has no `origin` remote.
#[tauri::command]
fn git_remote_url(repo_path: String) -> Result<String, String> {
    reject_traversal(Path::new(&repo_path))?;
    let url = git_run(&["-C", &repo_path, "remote", "get-url", "origin"])?;
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err("no origin remote".to_string());
    }
    Ok(trimmed)
}

/// Push the worktree's `branch` to origin (`push -u origin <branch>`). If the
/// worktree is dirty, commit the WIP first (same pattern as git_sync_main) so
/// the push includes the agent's work. The worktree shares the main repo's
/// remote. Returns git's push summary (mostly written to stderr).
#[tauri::command]
fn git_push(worktree_path: String, branch: String) -> Result<String, String> {
    reject_traversal(Path::new(&worktree_path))?;
    let wt = worktree_path.as_str();

    // Commit any uncommitted agent work first (git won't push it otherwise, and
    // a PR with an empty diff is useless). Mirrors git_sync_main's WIP commit.
    let dirty = !git_run(&["-C", wt, "status", "--porcelain"])?
        .trim()
        .is_empty();
    if dirty {
        git_run(&["-C", wt, "add", "-A"])?;
        git_run(&["-C", wt, "commit", "--no-verify", "-m", "WIP: before PR"])?;
    }

    let out = git_output(&["-C", wt, "push", "-u", "origin", &branch])?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(format!(
            "git push failed: {}",
            format!("{stderr}{stdout}").trim()
        ));
    }
    // git writes the "branch set up to track / new branch" summary to stderr.
    Ok(format!("{stdout}{stderr}").trim().to_string())
}

/// Last http(s) URL line in `s` (gh prints the PR URL on stdout, sometimes after
/// preamble lines). None when no URL line is present.
fn last_url_line(s: &str) -> Option<String> {
    s.lines()
        .map(str::trim)
        .filter(|l| l.starts_with("https://") || l.starts_with("http://"))
        .next_back()
        .map(String::from)
}

/// Open a GitHub PR for `branch` via `gh pr create` (cwd = repo_path). Uses
/// `--body-file` (NOT `--body`) so a large multi-line markdown body is safe.
/// Returns the PR URL (gh prints it on stdout). If a PR for the branch already
/// EXISTS, falls back to `gh pr view <branch> --json url -q .url`. Other
/// failures surface gh's stderr. Never touches `main`.
#[tauri::command]
fn gh_pr_create(
    repo_path: String,
    branch: String,
    title: String,
    body_file_path: String,
) -> Result<String, String> {
    reject_traversal(Path::new(&repo_path))?;
    reject_traversal(Path::new(&body_file_path))?;

    let out = std::process::Command::new("gh")
        .args([
            "pr",
            "create",
            "--head",
            &branch,
            "--title",
            &title,
            "--body-file",
            &body_file_path,
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("failed to run gh pr create: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        return last_url_line(&stdout).ok_or_else(|| {
            format!("gh pr create succeeded but no URL found: {}", stdout.trim())
        });
    }

    // A PR for this branch may already be open — return its URL instead of error.
    if format!("{stderr}{stdout}").contains("already exists") {
        let view = std::process::Command::new("gh")
            .args(["pr", "view", &branch, "--json", "url", "-q", ".url"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("failed to run gh pr view: {e}"))?;
        if view.status.success() {
            let url = String::from_utf8_lossy(&view.stdout).trim().to_string();
            if !url.is_empty() {
                return Ok(url);
            }
        }
        let vstderr = String::from_utf8_lossy(&view.stderr);
        return Err(format!("gh pr view failed: {}", vstderr.trim()));
    }

    Err(format!(
        "gh pr create failed: {}",
        format!("{stderr}{stdout}").trim()
    ))
}

// ============================================================================
// v0.5 slice 2.5 — preview readiness probe.
//
// `http_ping(url)` is a tiny TCP+HTTP reachability check used to poll a worktree
// dev server until it is serving, before pointing an iframe at it. The webview
// cannot reliably fetch a cross-origin http://localhost:<port> (CSP / opaque
// responses), so readiness is detected here instead: connect with a short
// timeout, send a minimal GET, and report whether the server wrote any bytes
// back. Pure std::net — no extra crates. Never errors on an unreachable target
// (returns Ok(false)); a malformed URL also yields Ok(false).
// ============================================================================

#[tauri::command]
fn http_ping(url: String) -> Result<bool, String> {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    // Parse `http(s)://host[:port]/path` without a URL crate (we only ever build
    // these ourselves as http://localhost:<port>/, but parse defensively).
    let rest = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .unwrap_or(&url);
    let slash = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..slash];
    let path = if slash < rest.len() { &rest[slash..] } else { "/" };
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => match p.parse::<u16>() {
            Ok(port) => (h.to_string(), port),
            Err(_) => return Ok(false),
        },
        None => (authority.to_string(), 80),
    };
    if host.is_empty() {
        return Ok(false);
    }

    let timeout = Duration::from_millis(700);
    let mut addrs = match (host.as_str(), port).to_socket_addrs() {
        Ok(a) => a,
        Err(_) => return Ok(false),
    };
    let addr = match addrs.next() {
        Some(a) => a,
        None => return Ok(false),
    };
    let mut stream = match TcpStream::connect_timeout(&addr, timeout) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let req = format!("GET {path} HTTP/1.0\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return Ok(false);
    }
    let mut buf = [0u8; 16];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => Ok(true),
        _ => Ok(false),
    }
}

// ============================================================================
// v0.5 slice 2.5.1 — node_modules symlink for worktree previews.
//
// A fresh git worktree omits node_modules (gitignored), so the worktree dev
// server can't `npm run dev`. Rather than `npm install` per worktree (slow,
// duplicated), we symlink the worktree's node_modules to the MAIN repo's
// installed one. Unix-only (the app targets macOS); both paths are
// `..`-guarded like every other path command.
// ============================================================================

/// Create a symlink at `link_path` pointing to `target`.
/// - No-op success if `link_path` already exists (any entry, incl. a symlink).
/// - Clear Err if `target` does not exist (the main repo has no node_modules).
#[tauri::command]
fn symlink(target: String, link_path: String) -> Result<(), String> {
    let target_p = Path::new(&target);
    let link_p = Path::new(&link_path);
    reject_traversal(target_p)?;
    reject_traversal(link_p)?;

    // symlink_metadata does NOT follow the link, so an existing (even broken)
    // symlink or real entry is detected and treated as a no-op.
    if link_p.symlink_metadata().is_ok() {
        return Ok(());
    }
    if !target_p.exists() {
        return Err(format!(
            "node_modules not found in the main repo — run `npm install` there first ({})",
            target_p.display()
        ));
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target_p, link_p)
            .map_err(|e| format!("symlink {target} -> {link_path}: {e}"))
    }
    #[cfg(not(unix))]
    {
        Err("symlink is only supported on unix platforms".to_string())
    }
}

/// Clone a directory tree from `src` to `dst` using APFS copy-on-write
/// (`cp -c -R`), producing a REAL directory (not a symlink). Next.js/Turbopack
/// reject a `node_modules` SYMLINK that points outside the (worktree) project
/// root, so a fresh worktree gets a clonefile COPY of the main repo's
/// node_modules instead — near-instant + near-zero disk on APFS (copy-on-write).
/// - No-op success if `dst` already exists as a real directory/file.
/// - If `dst` is a prior (now-invalid) symlink, it is removed first, then cloned.
/// - Clear Err if `src` does not exist.
#[tauri::command]
fn clone_dir(src: String, dst: String) -> Result<(), String> {
    let src_p = Path::new(&src);
    let dst_p = Path::new(&dst);
    reject_traversal(src_p)?;
    reject_traversal(dst_p)?;

    if let Ok(meta) = dst_p.symlink_metadata() {
        if meta.file_type().is_symlink() {
            // Remove a prior symlink (e.g. the Turbopack-rejected node_modules link).
            std::fs::remove_file(dst_p)
                .map_err(|e| format!("remove existing symlink {dst}: {e}"))?;
        } else {
            // A real directory/file is already there — leave it untouched.
            return Ok(());
        }
    }

    if !src_p.exists() {
        return Err(format!(
            "source not found — run `npm install` in the main repo first ({})",
            src_p.display()
        ));
    }

    let status = std::process::Command::new("cp")
        .args(["-c", "-R", &src, &dst])
        .status()
        .map_err(|e| format!("cp -c -R {src} -> {dst}: {e}"))?;
    if !status.success() {
        return Err(format!("cp -c -R failed ({src} -> {dst})"));
    }
    Ok(())
}

/// The continuum app-data directory (e.g. ~/Library/Application Support/
/// com.continuum.app on macOS). Created if absent. Used to host git worktrees
/// OUTSIDE the user's repo — a worktree nested inside the repo makes tools that
/// infer their workspace root by walking up (Next.js/Turbopack, package
/// managers) find the PARENT repo's lockfile/node_modules and refuse to compile
/// the nested copy. An external location gives each worktree a single,
/// unambiguous root.
#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("app_data_dir create {}: {e}", dir.display()))?;
    }
    Ok(dir.to_string_lossy().into_owned())
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
            remove_path,
            move_path,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            command_exists,
            resolve_command,
            git_is_repo,
            git_worktree_add,
            git_diff,
            git_status,
            git_commit_all,
            git_worktree_remove,
            git_branch_delete,
            git_behind_ahead,
            git_sync_main,
            git_merge_conflict_check,
            git_merge_to_main,
            git_remote_url,
            git_push,
            gh_pr_create,
            http_ping,
            symlink,
            clone_dir,
            app_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
