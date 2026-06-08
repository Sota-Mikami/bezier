// Derived from onlook-dev/onlook packages/parser/src/code-edit/style.ts —
// Apache-2.0 (see ../LICENSE, ../NOTICE). MODIFIED: upstream `customTwMerge`
// (from @onlook/utility) replaced with plain `twMerge` from `tailwind-merge`.
// customTwMerge is just twMerge + a bg-class dedup wrapper; plain twMerge is
// sufficient for continuum v0.4 and avoids vendoring @onlook/utility. Logic
// (edit the JSX className attribute / cn() call, or insert one) is otherwise
// verbatim.

import { twMerge } from "tailwind-merge";

import type { T } from "../packages";
import { t } from "../packages";

export function addClassToNode(node: T.JSXElement, className: string): void {
  const openingElement = node.openingElement;
  const classNameAttr = openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && attr.name.name === "className",
  ) as T.JSXAttribute | undefined;

  if (classNameAttr) {
    if (t.isStringLiteral(classNameAttr.value)) {
      classNameAttr.value.value = twMerge(classNameAttr.value.value, className);
    } else if (
      t.isJSXExpressionContainer(classNameAttr.value) &&
      t.isCallExpression(classNameAttr.value.expression)
    ) {
      classNameAttr.value.expression.arguments.push(t.stringLiteral(className));
    }
  } else {
    insertAttribute(openingElement, "className", className);
  }
}

export function replaceNodeClasses(node: T.JSXElement, className: string): void {
  const openingElement = node.openingElement;
  const classNameAttr = openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && attr.name.name === "className",
  ) as T.JSXAttribute | undefined;

  if (classNameAttr) {
    classNameAttr.value = t.stringLiteral(className);
  } else {
    insertAttribute(openingElement, "className", className);
  }
}

function insertAttribute(
  element: T.JSXOpeningElement,
  attribute: string,
  className: string,
): void {
  const newClassNameAttr = t.jsxAttribute(
    t.jsxIdentifier(attribute),
    t.stringLiteral(className),
  );
  element.attributes.push(newClassNameAttr);
}

export function updateNodeProp(
  node: T.JSXElement,
  key: string,
  value: object | string | boolean | undefined | null,
): void {
  const openingElement = node.openingElement;
  const existingAttr = openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && attr.name.name === key,
  ) as T.JSXAttribute | undefined;

  if (value === undefined || value === null) {
    return;
  }

  if (existingAttr) {
    if (typeof value === "boolean") {
      existingAttr.value = t.jsxExpressionContainer(t.booleanLiteral(value));
    } else if (typeof value === "string") {
      existingAttr.value = t.stringLiteral(value);
    } else if (typeof value === "function") {
      existingAttr.value = t.jsxExpressionContainer(
        t.arrowFunctionExpression([], t.blockStatement([])),
      );
    } else {
      existingAttr.value = t.jsxExpressionContainer(
        t.identifier(value.toString()),
      );
    }
  } else {
    let newAttr: T.JSXAttribute;
    if (typeof value === "boolean") {
      newAttr = t.jsxAttribute(
        t.jsxIdentifier(key),
        t.jsxExpressionContainer(t.booleanLiteral(value)),
      );
    } else if (typeof value === "string") {
      newAttr = t.jsxAttribute(t.jsxIdentifier(key), t.stringLiteral(value));
    } else if (typeof value === "function") {
      newAttr = t.jsxAttribute(
        t.jsxIdentifier(key),
        t.jsxExpressionContainer(
          t.arrowFunctionExpression([], t.blockStatement([])),
        ),
      );
    } else {
      newAttr = t.jsxAttribute(
        t.jsxIdentifier(key),
        t.jsxExpressionContainer(t.identifier(value.toString())),
      );
    }

    openingElement.attributes.push(newAttr);
  }
}
