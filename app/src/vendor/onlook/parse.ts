// Derived from onlook-dev/onlook packages/parser/src/parse.ts — Apache-2.0
// (see ./LICENSE, ./NOTICE). MODIFIED: `@onlook/constants` import localized to
// ./constants. Logic is otherwise verbatim (parse/generate round-trip with
// retainLines preserves source formatting).

import { EditorAttributes } from "./constants";
import { isReactFragment } from "./helpers";
import type { NodePath, T } from "./packages";
import { generate, parse, t, traverse } from "./packages";

export function getAstFromContent(content: string): T.File | null {
  try {
    return parse(content, {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        ["decorators", { decoratorsBeforeExport: true }],
        "classStaticBlock",
        "dynamicImport",
        "importMeta",
      ],
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

export function getAstFromCodeblock(
  code: string,
  stripIds = false,
): T.JSXElement | undefined {
  const ast = getAstFromContent(code);
  if (!ast) {
    return;
  }
  if (stripIds) {
    removeIdsFromAst(ast);
  }
  const jsxElement = ast.program.body.find(
    (node) => t.isExpressionStatement(node) && t.isJSXElement(node.expression),
  );

  if (
    jsxElement &&
    t.isExpressionStatement(jsxElement) &&
    t.isJSXElement(jsxElement.expression)
  ) {
    return jsxElement.expression;
  }
}

export function getContentFromAst(ast: T.File, originalContent: string): string {
  return generate(
    ast,
    {
      retainLines: true,
      compact: false,
      comments: true,
      concise: false,
      minified: false,
      jsonCompatibleStrings: false,
      shouldPrintComment: () => true,
      retainFunctionParens: true,
    },
    originalContent,
  ).code;
}

export function removeIdsFromAst(ast: T.File) {
  traverse(ast, {
    JSXOpeningElement(path: NodePath<T.JSXOpeningElement>) {
      if (isReactFragment(path.node)) {
        return;
      }
      const attributes = path.node.attributes;
      const existingAttrIndex = attributes.findIndex(
        (attr) =>
          t.isJSXAttribute(attr) &&
          attr.name.name === EditorAttributes.DATA_ONLOOK_ID,
      );

      if (existingAttrIndex !== -1) {
        attributes.splice(existingAttrIndex, 1);
      }
    },
  });
}
