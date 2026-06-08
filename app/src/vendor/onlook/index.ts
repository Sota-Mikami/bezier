// Vendored Onlook parser subset (Apache-2.0). See ./LICENSE and ./NOTICE for
// attribution and the list of modifications. continuum imports the element-edit
// write-back pipeline from here.

export { EditorAttributes, createOid, createDomId } from "./constants";
export type { T, NodePath, GeneratorOptions } from "./packages";
export { isReactFragment } from "./helpers";
export {
  getAstFromContent,
  getAstFromCodeblock,
  getContentFromAst,
  removeIdsFromAst,
} from "./parse";
export { addOidsToAst, getAllExistingOids } from "./ids";
export { getOidFromJsxElement } from "./code-edit/helpers";
export {
  addClassToNode,
  replaceNodeClasses,
  updateNodeProp,
} from "./code-edit/style";
export { transformAst, type CodeDiffRequest } from "./code-edit/transform";
