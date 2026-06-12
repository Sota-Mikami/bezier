<!-- 作成日: 2026-06-12 / Owner: CEO+CoS / 親=2026-06-11_ia-and-issue-model.md / DEC-012(反復ループ) -->
# chat-first 反復ループ 実装プラン（Spec⇄チャット同期 ＋ セッション復元）

> dogfood で CEO: Preview で「変だな」→ spec を更新/会話で指示、の往復がやりにくい。課題=①手で直した spec を「読み直して」と毎回言う手間 ②離脱→復帰でチャットが消える/復元法が不明。理想=チャットだけで Spec も Design も回る。

## 0. 根因
- ①: **agent は worktree でコードを編集するが、spec.md は worktree の外**（main repo `.continuum/drafts/<ulid>/`）→ agent が spec を触れず、Spec とチャットが分断。
- ②: 右の常駐ターミナルは**ライブ pty**＝離脱/再起動で session 揮発、transcript も resume も無い。

## 1. Spec をチャットに繋ぐ（A+B / 課題①）
- **agent に spec.md への読み書きアクセスを渡す**: launch 時に `--add-dir <issue.dir>`（drafts フォルダ）を claude 引数に追加 → agent が `<issue.dir>/spec.md` を read+write 可能に。
- **handoff 指示を更新**: 「spec.md がこの issue の生きた仕様。**実装前に必ず読み直す**。会話で意図/要件が変わったら **spec.md を更新**してから実装。spec と実装を同期させる」。
  - → これで「実装前に毎回最新 spec を読む」＝手動 re-read 不要。会話で「ここ詰めて」→ agent が spec＋コードを両方更新。
- **Spec タブの live 同期（file-watch）**: Spec タブが開いている間、`spec.md` をポーリング（readFile で内容比較・~1.5s）。
  - 外部で変わった ＆ エディタが **clean（未編集）** → **非破壊で内容リロード**（カーソルは可能な範囲で保持）。
  - エディタが **dirty（人が編集中）** ＆ 外部変更 → 競合 → 「外部で更新されました（リロード / 自分の変更を保持）」を控えめに表示。
  - 既存の autosave と整合：人が編集→autosave で書き戻し / agent が編集→watch で取り込み。同時タイピングは稀（人は話す、agent が書く）。

## 2. セッション復元（C+D / 課題②）
- **resume（`claude --continue`）**: issue を開いた時に worktree が既にあれば、右パネルの空状態を **「セッションを再開」**（= `claude --continue` を worktree で起動）に。Implement=新規 seed / 再オープン=resume。`--continue` が前回 session 無しで失敗したら新規にフォールバック。
- **durable な activity thread（左「スレッド」）**: issue の主要イベントを記録して左に時系列表示（pty が死んでても見える）。
  - イベント: 起票 / Implement / Re-run / Sync with main / Accept / Merge / Discard / （agent が spec を更新）。
  - 保存: `.continuum/issues/<ulid>/thread.json`（gitignore のローカル作業ストア）。各 `{type, at, note}`。
  - ※ フルチャット transcript のレンダは**スコープ外**（resume で会話は見える）。thread は構造化イベントログ。

## 3. UI まとめ（Issue 詳細）
- 左 thread: 起票＋活動イベント（durable）。
- 中央 Spec|Design: Spec は live 同期（agent 編集も反映）／Design は実物。
- 右 agent パネル: Implement（新規）/ Resume（再開）/ Re-run / Accept / Discard ＋ behind/Sync/Merge（既存）。

## 4. 受け入れ（dogfood）
1. Preview で変だと感じ、右でチャット「ここ詰めて」→ agent がコード＋**spec.md を更新** → **Spec タブが自動で反映**
2. spec を手で直して「やって」→ agent が最新 spec を読んで実装（「読み直して」不要）
3. アプリ離脱→再オープン → **「セッションを再開」で続きから** ＋ 左 thread に履歴
4. 既存（Implement/Accept/Discard/Preview web&tauri/merge安全）を壊さない

## 5. 検証ゲート
cargo build（触れば）/ tsc=0 / eslint clean / next build / `/issues` 200。実 agent の spec 編集・watch・resume は dogfood ゲート。

## 6. 非スコープ（後）
フルチャット transcript レンダ / 複数 session 管理 / spec 競合の3-way マージ（今は「外部更新の検知＋選択」まで）。

## 7. follow-up（このビルド着地後に着工）＝ ライブ変化ビジュアル（CEO 発意）
> 「チャットしながら Spec/Design が目の前で変わるのを見たい」。本ビルドの file-watch の上に additive で乗せる。
- **トリガーは "実ファイルの変化"**（agent の発言解析でなく、堅牢）：
  - `spec.md` 変化 → **Spec タブへ自動切替 ＋ 旧→新 line diff → 変更行を CM デコレーションでフラッシュ（数秒 fade）**＝「変更箇所がライブで変わる」。CM デコ基盤は Live Preview 用に既存。
  - worktree コード変化 → **Design(iframe) は HMR で既に live 再描画** → Design タブへ自動切替。
- **フォーカス制御**：変わったタブに「● 更新中」パルス。ユーザーが手動で別タブを見てる間は奪わない（少し待つ/クリック誘導）。
- ※ agent は spec を一括書き込み → "1文字ずつ" は出せないが、差分フラッシュの方が「どこが変わったか」が一目で分かる。
- 役割分担：左 thread=後から振り返る／このライブ可視化=今まさに見る。
