<!-- 作成日: 2026-06-04 / Owner: Principal Designer -->
# continuum セルフモック（dogfood #0）

continuum の最初のコンセプトモック。題材は **continuum 自身の UI**、接地先は CEO の実作業（**mikan / Sotas**）。「役割の連続体」という理想への回答であり、同時に今日の仕事が楽になる絵。

## シナリオ
mikan の Design Issue **ISSUE-214「単語の間隔反復（SRS）復習画面」** を、continuum 上で Intent → Spec → Design/Mock → QA まで一気通貫で進める様子。mikan リポジトリから既存部品（WordCard / PrimaryButton / ProgressBar）と design token（#FF8900）を流用してモック生成 → Notion風 Spec → QA 自動生成。

## ファイル
| | 画面 | 示す機能 |
|---|---|---|
| `01-canvas.html` / `.png` | Canvas（Figma風） | 既存repo流用モック生成・実部品インスタンス・variant・AIペア・流用部品リスト |
| `02-spec-qa.html` / `.png` | Spec & QA | Notion風 block エディタ・AI下書き・受け入れ基準・spec+mockからQA自動生成・Linear連携 |

## レンダー方法（再現）
```
chrome --headless=new --force-device-scale-factor=2 --window-size=1440,900 \
  --screenshot=01-canvas.png file://.../01-canvas.html
```
2880×1800（Retina 2x）。

## 位置づけ
これは **使い捨ての静的モック**（continuum が将来 *出力する* 成果物のプレビュー）。本体実装（`app/`）ではない。ISSUE-001 スパイクが「実際に生成できるか」を証明する。
