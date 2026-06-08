// Derived from onlook-dev/onlook packages/parser/src/helpers.ts — Apache-2.0
// (see ./LICENSE, ./NOTICE). Trimmed to the helpers continuum uses
// (isReactFragment); the tailwind-config helpers were dropped as out of scope.

import type { T } from "./packages";
import { t } from "./packages";

export function isReactFragment(openingElement: T.JSXOpeningElement): boolean {
  const name = openingElement.name;

  if (t.isJSXIdentifier(name)) {
    return name.name === "Fragment";
  }

  if (t.isJSXMemberExpression(name)) {
    return (
      t.isJSXIdentifier(name.object) &&
      name.object.name === "React" &&
      t.isJSXIdentifier(name.property) &&
      name.property.name === "Fragment"
    );
  }

  return false;
}
