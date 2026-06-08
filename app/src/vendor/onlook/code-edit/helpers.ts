// Derived from onlook-dev/onlook packages/parser/src/code-edit/helpers.ts —
// Apache-2.0 (see ../LICENSE, ../NOTICE). Trimmed to getOidFromJsxElement; the
// move-key / param / codegen helpers were dropped as out of scope for v0.4.

import { EditorAttributes } from "../constants";
import type { T } from "../packages";
import { t } from "../packages";

export function getOidFromJsxElement(element: T.JSXOpeningElement): string | null {
  const attribute = element.attributes.find(
    (attr): attr is T.JSXAttribute =>
      t.isJSXAttribute(attr) &&
      attr.name.name === EditorAttributes.DATA_ONLOOK_ID,
  );

  if (!attribute?.value) {
    return null;
  }

  if (t.isStringLiteral(attribute.value)) {
    return attribute.value.value;
  }

  return null;
}
