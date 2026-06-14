"use client";

// The marketplace entry point (DEC-076 follow-up): manage the `/bezier:*`
// slash-command pack from the UI. Disk IS the source of truth — every row is a
// file under ~/.claude/commands/bezier/, so editing / adding / deleting here is
// just reading and writing those files. Built-ins (verify/spec/alt3/precommit)
// can be edited and "reset to default"; custom ones the maker adds are theirs.
// Nothing is written without an explicit action (the opt-in policy stands).

import * as React from "react";
import {
  Loader2,
  Check,
  Terminal,
  Plus,
  Trash2,
  RotateCcw,
  Download,
  Pencil,
} from "lucide-react";

import { homeDir, confirmDialog } from "@/lib/ipc";
import {
  listInstalledCommands,
  installBezierCommands,
  uninstallBezierCommands,
  writeCommand,
  removeCommand,
  builtinDefault,
  isValidCommandName,
  BEZIER_COMMANDS,
  type InstalledCommand,
} from "@/lib/bezier-commands";

type Draft = { name: string; description: string; body: string };
const EMPTY: Draft = { name: "", description: "", body: "" };

export function BezierCommandsManager() {
  const [home, setHome] = React.useState<string | null>(null);
  const [list, setList] = React.useState<InstalledCommand[] | null>(null); // null = loading
  const [editing, setEditing] = React.useState<string | null>(null); // name | "+new" | null
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const h = await homeDir();
        const l = await listInstalledCommands(h);
        if (!cancelled) {
          setHome(h);
          setList(l);
        }
      } catch {
        if (!cancelled) setList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async (h: string) => setList(await listInstalledCommands(h));

  const missingBuiltins = React.useMemo(() => {
    if (!list) return [];
    const have = new Set(list.map((c) => c.name));
    return BEZIER_COMMANDS.filter((b) => !have.has(b.name));
  }, [list]);

  const startEdit = (c: InstalledCommand) => {
    setEditing(c.name);
    setDraft({ name: c.name, description: c.description, body: c.body });
    setMsg(null);
  };
  const startAdd = () => {
    setEditing("+new");
    setDraft(EMPTY);
    setMsg(null);
  };
  const cancel = () => {
    setEditing(null);
    setMsg(null);
  };

  const save = async (name: string) => {
    if (!home || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await writeCommand(home, name, draft.description.trim(), draft.body.trimEnd());
      await reload(home);
      setEditing(null);
      setMsg(`/bezier:${name} を保存しました。`);
    } catch (e) {
      setMsg(`失敗: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!home || busy) return;
    const name = draft.name.trim();
    if (!isValidCommandName(name)) {
      setMsg("名前は英小文字・数字・ハイフンのみ（例: my-check）。");
      return;
    }
    if (list?.some((c) => c.name === name)) {
      setMsg(`/bezier:${name} は既にあります。`);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await writeCommand(home, name, draft.description.trim(), draft.body.trimEnd());
      await reload(home);
      setEditing(null);
      setMsg(`/bezier:${name} を作成しました。`);
    } catch (e) {
      setMsg(`失敗: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const del = async (name: string) => {
    if (!home || busy) return;
    if (
      !(await confirmDialog(`/bezier:${name} を削除しますか？`, {
        title: "削除の確認",
        okLabel: "削除",
        cancelLabel: "やめる",
      }))
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await removeCommand(name);
      await reload(home);
      if (editing === name) setEditing(null);
      setMsg(`/bezier:${name} を削除しました。`);
    } catch (e) {
      setMsg(`失敗: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const installMissing = async () => {
    if (!home || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await installBezierCommands(home, { overwrite: false });
      await reload(home);
      setMsg(n === 0 ? "すでに揃っています。" : `組み込みを ${n} 件入れました。`);
    } catch (e) {
      setMsg(`失敗: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const uninstallAll = async () => {
    if (!home || busy) return;
    if (
      !(await confirmDialog("~/.claude/commands/bezier/ をすべて削除しますか？（カスタム含む）", {
        title: "すべて削除",
        okLabel: "削除",
        cancelLabel: "やめる",
      }))
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await uninstallBezierCommands();
      await reload(home);
      setEditing(null);
      setMsg("すべて削除しました。");
    } catch (e) {
      setMsg(`失敗: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* header: path + count + uninstall-all */}
      <div className="flex items-center gap-2 text-xs">
        <Terminal className="size-3.5 text-muted-foreground" />
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          ~/.claude/commands/bezier/
        </code>
        {list && list.length > 0 && (
          <>
            <span className="text-muted-foreground">{list.length} 件</span>
            <button
              type="button"
              onClick={() => void uninstallAll()}
              disabled={busy}
              className="ml-auto text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              すべて削除
            </button>
          </>
        )}
      </div>

      {list === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          確認中…
        </div>
      ) : list.length === 0 && editing !== "+new" ? (
        // Empty state: seed the built-ins.
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">
            まだ何もインストールされていません。組み込みの 4 コマンドを入れるか、自分で作れます。
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void installMissing()}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              組み込みをインストール
            </button>
            <button
              type="button"
              onClick={startAdd}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-muted disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              コマンドを追加
            </button>
          </div>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.map((c) =>
            editing === c.name ? (
              <li key={c.name} className="p-3">
                <CommandForm
                  draft={draft}
                  setDraft={setDraft}
                  nameLocked
                  busy={busy}
                  onCancel={cancel}
                  onSubmit={() => void save(c.name)}
                  submitLabel="保存"
                  extra={
                    <>
                      {c.isBuiltin && (
                        <button
                          type="button"
                          onClick={() => {
                            const def = builtinDefault(c.name);
                            if (def)
                              setDraft((d) => ({
                                ...d,
                                description: def.description,
                                body: def.body,
                              }));
                          }}
                          disabled={busy}
                          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <RotateCcw className="size-3" />
                          既定に戻す
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void del(c.name)}
                        disabled={busy}
                        className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-3" />
                        削除
                      </button>
                    </>
                  }
                />
              </li>
            ) : (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <code className="font-mono text-xs text-foreground/90">/bezier:{c.name}</code>
                  {c.isBuiltin && (
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      組み込み
                    </span>
                  )}
                  <span className="truncate text-[11px] text-muted-foreground">
                    {c.description || "（説明なし）"}
                  </span>
                  <Pencil className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ),
          )}

          {editing === "+new" && (
            <li className="p-3">
              <CommandForm
                draft={draft}
                setDraft={setDraft}
                nameLocked={false}
                busy={busy}
                onCancel={cancel}
                onSubmit={() => void create()}
                submitLabel="作成"
              />
            </li>
          )}
        </ul>
      )}

      {/* footer actions */}
      {list && list.length > 0 && editing !== "+new" && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startAdd}
            disabled={busy}
            className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            コマンドを追加
          </button>
          {missingBuiltins.length > 0 && (
            <button
              type="button"
              onClick={() => void installMissing()}
              disabled={busy}
              className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Download className="size-3.5" />
              不足の組み込みを入れる（{missingBuiltins.length}）
            </button>
          )}
        </div>
      )}

      {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
    </div>
  );
}

// The shared edit/add form. `nameLocked` shows the name read-only (edit) vs. a
// slug input (add).
function CommandForm({
  draft,
  setDraft,
  nameLocked,
  busy,
  onCancel,
  onSubmit,
  submitLabel,
  extra,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  nameLocked: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {nameLocked ? (
        <code className="font-mono text-xs text-foreground/90">/bezier:{draft.name}</code>
      ) : (
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">
            名前（`/bezier:` の後ろ・英小文字/数字/ハイフン）
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">/bezier:</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="my-check"
              spellCheck={false}
              className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">説明（/ メニューに出る一行）</span>
        <input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="このコマンドが何をするか"
          className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">
          本文（エージェントに送るプロンプト。`$ARGUMENTS` で引数を受け取れます）
        </span>
        <textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          rows={6}
          spellCheck={false}
          placeholder="このコマンドが実行する内容…"
          className="w-full resize-y rounded-md border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-7 rounded-md border px-3 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          キャンセル
        </button>
        <span className="ml-auto flex items-center gap-2">{extra}</span>
      </div>
    </div>
  );
}

export default BezierCommandsManager;
