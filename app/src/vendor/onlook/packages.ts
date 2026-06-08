// Derived from onlook-dev/onlook packages/parser/src/packages.ts — Apache-2.0
// (see ./LICENSE, ./NOTICE). Verbatim.
//
// Thin wrapper that re-exports the Babel toolchain from @babel/standalone so the
// rest of the vendored parser uses one engine. @babel/standalone bundles
// parser + generator + traverse + types and runs in both Node and the browser.

import { packages } from "@babel/standalone";

import type { GeneratorOptions } from "@babel/generator";
import type { NodePath } from "@babel/traverse";
import type * as T from "@babel/types";

export const { parse } = packages.parser;
export const { generate } = packages.generator;
export const traverse = packages.traverse.default;
export const t = packages.types;

export type { T, NodePath, GeneratorOptions };
