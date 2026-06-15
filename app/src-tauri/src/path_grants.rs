use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct PathGrantState {
    pub roots: Mutex<HashSet<PathBuf>>,
}

/// Reject any path that contains a `..` (ParentDir) component. Used to prevent
/// path traversal before touching the filesystem.
pub fn reject_traversal(path: &Path) -> Result<(), String> {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!(
            "refusing path containing '..' (traversal): {}",
            path.display()
        ));
    }
    Ok(())
}

pub fn canonicalize_existing_or_parent(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return fs::canonicalize(path)
            .map_err(|e| format!("cannot resolve {}: {e}", path.display()));
    }
    let mut missing: Vec<PathBuf> = Vec::new();
    let mut cur = path;
    while !cur.exists() {
        let name = cur
            .file_name()
            .ok_or_else(|| format!("cannot resolve any existing parent for {}", path.display()))?;
        missing.push(PathBuf::from(name));
        cur = cur
            .parent()
            .ok_or_else(|| format!("path has no parent: {}", path.display()))?;
    }
    let mut resolved = fs::canonicalize(cur)
        .map_err(|e| format!("cannot resolve parent {}: {e}", cur.display()))?;
    for part in missing.iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}

pub fn grant_root(
    state: &tauri::State<'_, PathGrantState>,
    path: &Path,
) -> Result<PathBuf, String> {
    reject_traversal(path)?;
    let canonical =
        fs::canonicalize(path).map_err(|e| format!("grant_path {}: {e}", path.display()))?;
    reject_traversal(&canonical)?;
    state
        .roots
        .lock()
        .map_err(|e| format!("grant_path lock: {e}"))?
        .insert(canonical.clone());
    Ok(canonical)
}

pub fn grant_existing_or_future(
    state: &tauri::State<'_, PathGrantState>,
    path: &Path,
) -> Result<PathBuf, String> {
    reject_traversal(path)?;
    let resolved = canonicalize_existing_or_parent(path)?;
    reject_traversal(&resolved)?;
    state
        .roots
        .lock()
        .map_err(|e| format!("grant_path lock: {e}"))?
        .insert(resolved.clone());
    Ok(resolved)
}

pub fn ensure_granted(state: &tauri::State<'_, PathGrantState>, path: &Path) -> Result<(), String> {
    reject_traversal(path)?;
    let resolved = canonicalize_existing_or_parent(path)?;
    reject_traversal(&resolved)?;
    let roots = state
        .roots
        .lock()
        .map_err(|e| format!("path grant lock: {e}"))?;
    if is_granted_path(&roots, &resolved) {
        return Ok(());
    }
    Err(format!("refusing ungranted path: {}", resolved.display()))
}

fn is_granted_path(roots: &HashSet<PathBuf>, resolved: &Path) -> bool {
    roots.iter().any(|root| resolved.starts_with(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "bezier-path-grant-test-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        fs::canonicalize(root).expect("canonical temp root")
    }

    #[test]
    fn path_grant_allows_descendants_and_future_files() {
        let root = temp_root("allow");
        let future = root.join(".bezier").join("issues").join("next.md");
        let resolved = canonicalize_existing_or_parent(&future).expect("resolve future path");
        let mut grants = HashSet::new();
        grants.insert(root.clone());

        assert!(is_granted_path(&grants, &resolved));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn path_grant_rejects_sibling_prefixes() {
        let root = temp_root("repo");
        let sibling = root.with_file_name(format!(
            "{}-evil",
            root.file_name().and_then(|n| n.to_str()).unwrap_or("repo")
        ));
        fs::create_dir_all(&sibling).expect("create sibling");
        let resolved = fs::canonicalize(&sibling).expect("canonical sibling");
        let mut grants = HashSet::new();
        grants.insert(root.clone());

        assert!(!is_granted_path(&grants, &resolved));

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(sibling);
    }

    #[test]
    fn traversal_guard_rejects_parent_dir_components() {
        assert!(reject_traversal(Path::new("/tmp/bezier/../secret")).is_err());
    }
}
