"use client";

// v0.3/v0.4 — "Add screen" form. Produces a new Screen for the Canvas SoR.
// Fields: label, source type (url | html | scenegraph | react-repo), and the
// ref(s):
//   - "url":         a URL
//   - "html"/"scenegraph": a local file path
//   - "react-repo" (v0.4): a dev-server URL shown in the iframe PLUS the local
//                  repo root used for Onlook-style AST write-back. This is the
//                  only editable source type.
//
// pickFolder is directory-only, so for file sources we accept a path string
// typed by the user (the route may wire a richer picker later — out of scope).
// On submit, the screen gets a stable id via newScreenId(existing) and a
// default layout box, then onAdd(screen) is called.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  newScreenId,
  type Screen,
  type ScreenSource,
} from "@/lib/screens";
import { cn } from "@/lib/utils";

export interface AddScreenProps {
  existing: Screen[];
  onAdd: (s: Screen) => void;
}

type SourceType = ScreenSource["type"];

// Default layout box for a freshly added screen (Canvas coords / px).
const DEFAULT_X = 40;
const DEFAULT_Y = 40;
const DEFAULT_W = 420;
const DEFAULT_H = 720;

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "url", label: "URL" },
  { value: "html", label: "HTML file" },
  { value: "scenegraph", label: "Scene graph" },
  { value: "react-repo", label: "React repo (editable)" },
];

export default function AddScreen({ existing, onAdd }: AddScreenProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<SourceType>("url");
  const [ref, setRef] = useState("");
  // Second field, only used by the "react-repo" source: the local repo root the
  // Onlook-style AST write-back targets (the first field holds its dev URL).
  const [repoPath, setRepoPath] = useState("");

  const trimmedRef = ref.trim();
  const trimmedRepo = repoPath.trim();
  const canSubmit =
    label.trim().length > 0 &&
    trimmedRef.length > 0 &&
    (type !== "react-repo" || trimmedRepo.length > 0);

  function buildSource(): ScreenSource {
    if (type === "url") return { type: "url", url: trimmedRef };
    if (type === "html") return { type: "html", path: trimmedRef };
    if (type === "scenegraph") return { type: "scenegraph", path: trimmedRef };
    return { type: "react-repo", url: trimmedRef, repoPath: trimmedRepo };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const screen: Screen = {
      id: newScreenId(existing),
      label: label.trim(),
      source: buildSource(),
      x: DEFAULT_X,
      y: DEFAULT_Y,
      w: DEFAULT_W,
      h: DEFAULT_H,
    };
    onAdd(screen);
    setLabel("");
    setRef("");
    setRepoPath("");
    setType("url");
  }

  const refPlaceholder =
    type === "url"
      ? "https://localhost:3000 or any URL"
      : type === "html"
        ? "/abs/path/to/page.html"
        : type === "scenegraph"
          ? "/abs/path/to/scene.json"
          : "http://localhost:3000 (dev-server URL)";

  // First field's label changes per source type.
  const refFieldLabel =
    type === "url"
      ? "URL"
      : type === "react-repo"
        ? "Dev-server URL"
        : "File path";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-screen-label" className="text-sm font-medium">
          Label
        </label>
        <Input
          id="add-screen-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Home screen"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-screen-type" className="text-sm font-medium">
          Source type
        </label>
        <select
          id="add-screen-type"
          value={type}
          onChange={(e) => setType(e.target.value as SourceType)}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
            "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          {SOURCE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="add-screen-ref" className="text-sm font-medium">
          {refFieldLabel}
        </label>
        <Input
          id="add-screen-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={refPlaceholder}
        />
        {type === "html" || type === "scenegraph" ? (
          <p className="text-xs text-muted-foreground">
            Enter an absolute path to the local{" "}
            {type === "html" ? "HTML" : "scene-graph JSON"} file.
          </p>
        ) : type === "react-repo" ? (
          <p className="text-xs text-muted-foreground">
            The running dev-server URL shown in the editable preview iframe.
          </p>
        ) : null}
      </div>

      {type === "react-repo" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-screen-repo" className="text-sm font-medium">
            Repo path
          </label>
          <Input
            id="add-screen-repo"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/abs/path/to/app-repo"
          />
          <p className="text-xs text-muted-foreground">
            Local repo root for Onlook-style AST write-back. Must be instrumented
            (data-oid) and load the Bezier preview bridge to be editable.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          Add screen
        </Button>
      </div>
    </form>
  );
}
