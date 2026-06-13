<!-- 作成日: 2026-06-13 / 用途: 別の最高峰LLMに渡す「LP First-View + インタラクション提案」プロンプト（self-contained） -->
# Prompt — Landing-page first-view & scroll-interaction concepts for **Bezier**

> 別モデルにそのまま貼って使うための self-contained プロンプト。リポ閲覧不可前提で必要情報を内包。
> 下の「===== PROMPT START =====」から「===== PROMPT END =====」までをコピーして渡す。

===== PROMPT START =====

You are a world-class brand & web art director + a creative front-end engineer. I need **several distinct, best-in-class concepts** for the **first view (hero) and its scroll-driven interaction** of a landing page. Ground every concept in the product and brand below. Don't give me generic SaaS heroes — push for *memorable, ownable, on-thesis* motion design.

## The product — Bezier
Bezier is an **agent workbench for product designers & PMs**. The user writes intent and annotates the screen — they place a few **control points** (intent / annotation / taste). An AI agent then **draws the curve** — it implements the actual software in an isolated worktree. No commands typed.

- One-line thesis / tagline: **"Hold the handles. The agent draws the curve."**（JP: 「ハンドルを握る。曲線はエージェントが描く。」）
- Why the name: a **Bézier curve** is defined by a few control points + handles a human drags; the smooth curve is generated. That maps exactly to the product: *you hold the few control points, the agent renders the rest.* The name = the thesis.
- Category: the workbench that sits between the designer/PM and the agent (like Figma sits between you and pixels). NOT "an AI code generator", NOT "another terminal UI".
- Audience (in order): ① PMs who can't design (stuck in Figma) ② AI-forward product designers / design engineers (Cursor/Superset users tired of engineer-facing UIs) ③ agency/contract designers (multi-brand throughput) ④ design-system leads / enterprise.
- Stage: pre-launch. The LP is a **waitlist** page. Primary language **Japanese**, with English brand terms (Bezier / handle / curve) left in English.

## Brand personality & voice
- **Precise, but warm.** Like a Bézier curve: mathematically exact, yet the resulting form is organic and beautiful.
- Quiet, confident, craft-like. NOT loud, NOT hype, NOT "revolutionary AI". The "wow" comes from the *experience/demo*, not adjectives.
- You (the designer) stay in control; the agent executes. Always reversible.
- Voice samples: ○「やりたいことを書く。ハンドルを置く。あとはエージェントが描く。」 ○「あなたは判断する人。タイピストではなく。」 ✕「AIが全自動で開発を革命的に加速！」

## Brand visual system (HARD CONSTRAINTS — every concept must obey)
- **Monochrome only.** Ink + greys. No brand hue. Hierarchy is built with **value (light/dark)**, not color. The single allowed non-neutral is a functional red for destructive states (don't use it in the hero).
  - ink `#1c1c24`, near-white paper `#f7f6f3`, true-dark surface `#0e0e12`. Avoid pure #000 / #fff at large scale.
  - Treatment can be "lit black": a black mark/shape may carry a *subtle one-direction gradient sheen* (light hitting it) so it's not flat — but never colorful.
- **The logo & its grammar are the brand's core motif — use them.** The logo is an **abstracted pen tool**, monochrome:
  - a **square anchor** (hollow diamond) = an on-curve point / the repo's start (a point you place),
  - a **handle line** to a **round knob** (hollow circle) = the control handle you hold,
  - a **curve** that leaves the anchor and sweeps — what the agent draws.
  - Rule: the square and the circle are **always joined by the handle line** (that connection is what reads as "bézier"). Nodes are **outlined/hollow**; the curve is **collinear** with the handle at the anchor then sweeps gracefully.
  - So the brand's reusable objects are: **square (on-curve anchor), circle (off-curve control handle), tangent line, bézier curve, faint construction grid.** Concepts should compose these.
- **Motion = the name.** All easing MUST be bézier `cubic-bezier(...)` (never linear), fast (≤240ms for UI, longer for hero scrubbing is fine), reversible, no bounce. Motion is one of the few places the brand literally *is* its name — make it feel intentional and crafted.
- **"Dissolve the black screen."** Designers fear terminals. Never show a hostile black console / green hacker text. The agent's work, if shown, reads as a calm flow, not a slab.
- Typography: clean geometric/neutral sans, tracking-tight headings. Numbers/code/paths in monospace.

## The goal
Design the **hero / first view** and its **scroll-driven interaction** (what changes as the user scrolls). I want **first-view presence on par with a benchmark** (see below) AND a scroll transformation that is *ownable to Bezier* (uses the pen-tool/bézier grammar, monochrome).

### Benchmarks & inspiration (match this level of presence; do NOT copy)
- **tryglen.com** — the first-view presence benchmark: a large, dense, intricate monochrome geometric centerpiece (a chrysanthemum-like particle orb) center-bottom, headline + 2 CTAs above; the object reacts to scroll.
- **Orvior-style pen-tool typography** — a word rendered as a vector outline with visible square on-curve anchors + round control handles + tangent lines + faint construction grid (type shown "in the pen tool").
- **Bauhaus / geometric poster** language — bold primary shapes, grids, kinetic type (but keep it monochrome here).
- General **bézier-curve aesthetics** — control points, pen-tool, curves wrapping/forming.

### What we've already prototyped (build BEYOND these — propose better/other)
1. A hero **"bloom" orb woven from hundreds of fine bézier curves** on a fibonacci sphere, auto-rotating; scroll adds rotation + opens the bloom. (Read: on-brand, but felt a touch wispy / not bold enough.)
2. A **pinned pen-tool-typography hero**: the bold word "Hold the handles" starts as solid ink, and on scroll dissolves into its **outline redrawn as a bézier path** with **many square anchors + round control handles + tangent lines + faint grid** (Orvior-style). (Read: strong; this is the current front-runner.)

## What I want from you — deliverable
Produce **5 distinct concepts** (markedly different from each other, not variations). For **each** concept give:
1. **Name** + one-line essence.
2. **First view (static composition):** describe the layout precisely — what's the dominant centerpiece, where the headline/sub/CTA sit, balance, negative space. Include a **rough ASCII wireframe**.
3. **Scroll interaction (storyboard):** scene-by-scene, what transforms as the user scrolls (0% → 100% of the pinned section). Be concrete about the *mechanic* (pin/scrub, morph, draw-in, parallax, assemble/disassemble, rotate, etc.) and the *easing feel*.
4. **Why it's on-thesis & on-brand:** how it uses the pen-tool grammar (square/circle/handle/curve), stays monochrome, and embodies "you hold the handles, the agent draws."
5. **Implementation sketch:** feasible approach (the site is **Next.js static export, React, Tailwind, client components**; **Canvas 2D / SVG / SMIL / CSS / lightweight WebGL** all allowed; keep it performant, reduced-motion-safe). Note any data/asset needs.
6. **Risk / failure mode:** when this concept would look bad or get gimmicky, and how to avoid it.

Then:
- A short **comparison table** (presence, ownability, build cost, motion-craft, risk).
- A clear **recommendation** (which 1–2 to build first and why), and how the **rest of the page sections** (3-beat loop / features / "who it's for" / final CTA) could echo the hero's motion language so the whole LP feels coherent.

### Style of your answer
- Be opinionated and specific; this is art direction, not a menu of clichés.
- Use ASCII wireframes/storyboards liberally.
- Keep copy suggestions in **Japanese** (primary) with English brand terms; the thesis line stays "Hold the handles."
- Assume monochrome; if you ever feel you "need color", solve it with value/texture/motion instead.

===== PROMPT END =====

---

## 使い方メモ（自分用）
- 上の PROMPT START〜END をコピーして、別の最高峰モデルに貼る。
- 返ってきた 5 案を見て、good な方向を選んだら、このセッション（または実装担当）に「この案で実装」と指示。
- 既存プロトタイプ（orb / pen-type）は `site/src/components/hero-orb.tsx` / `hero-type.tsx` にある（front-runner = pen-type）。
- 追加で渡せる素材：ロゴ確定アセット `design/brand/logo/`、ブランド SSOT `design/brand/2026-06-12_brand-strategy.md` / `PRINCIPLES.md` / `2026-06-12_design-tokens.md`。
