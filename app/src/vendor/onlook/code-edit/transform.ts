// Derived from onlook-dev/onlook packages/parser/src/code-edit/transform.ts —
// Apache-2.0 (see ../LICENSE, ../NOTICE). MODIFIED / TRIMMED for continuum v0.4:
// only attributes.className and other prop edits are handled. Upstream also
// applies textContent edits and structureChanges (group/insert/move/remove/
// image) via @onlook/models action types; those modules + the @onlook/models
// dependency are intentionally NOT vendored (out of scope for element styling).
//
// A minimal local CodeDiffRequest type replaces @onlook/models/code.

import type { T } from "../packages";
import { traverse } from "../packages";
import { getOidFromJsxElement } from "./helpers";
import { addClassToNode, replaceNodeClasses, updateNodeProp } from "./style";

/**
 * Minimal subset of Onlook's CodeDiffRequest covering className + prop edits.
 * `attributes.className` is merged (Tailwind-aware) unless `overrideClasses` is
 * set, in which case the className is replaced wholesale.
 */
export interface CodeDiffRequest {
  attributes?: Record<string, string | boolean>;
  overrideClasses?: boolean;
}

export function transformAst(
  ast: T.File,
  oidToCodeDiff: Map<string, CodeDiffRequest>,
): void {
  traverse(ast, {
    JSXElement(path) {
      const currentOid = getOidFromJsxElement(path.node.openingElement);
      if (!currentOid) {
        return;
      }
      const codeDiffRequest = oidToCodeDiff.get(currentOid);
      if (codeDiffRequest) {
        const { attributes } = codeDiffRequest;

        if (attributes) {
          Object.entries(attributes).forEach(([key, value]) => {
            if (key === "className") {
              if (codeDiffRequest.overrideClasses) {
                replaceNodeClasses(path.node, value as string);
              } else {
                addClassToNode(path.node, value as string);
              }
            } else {
              updateNodeProp(path.node, key, value);
            }
          });
        }
      }
    },
  });
}
