"use client";

// Render kit for the Plate UI editor.
//
// markdown.ts (the FROZEN round-trip contract) deserializes markdown into the
// correct Plate node TYPES, but the UI editor only mounts MarkdownPlugin, which
// registers NO element/leaf renderers — so rich nodes render flat. This file
// adds PURELY additive render plugins (no transforms, no serialization changes)
// so headings/tables/quotes/code/lists/marks display readably.
//
// IMPORTANT: serialization is owned entirely by src/lib/markdown.ts (its own
// headless editor). These plugins only attach React components to existing node
// types, so they cannot change how content saves.

import * as React from "react";
import {
  createPlatePlugin,
  ParagraphPlugin,
  PlateElement,
  PlateLeaf,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";

/** Node shape carrying the indent-list props mdToPlate emits on `p` nodes. */
type ListProps = {
  listStyleType?: "disc" | "decimal";
  indent?: number;
  listStart?: number;
};

// --- Block elements -------------------------------------------------------

function H1Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      className="mt-4 mb-2 text-2xl font-semibold"
      {...props}
    />
  );
}

function H2Element(props: PlateElementProps) {
  return (
    <PlateElement as="h2" className="mt-4 mb-2 text-xl font-semibold" {...props} />
  );
}

function H3Element(props: PlateElementProps) {
  return (
    <PlateElement as="h3" className="mt-3 mb-1 text-lg font-semibold" {...props} />
  );
}

function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
      {...props}
    />
  );
}

function CodeBlockElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="pre"
      className="my-2 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.85em] leading-relaxed"
      {...props}
    />
  );
}

function CodeLineElement(props: PlateElementProps) {
  return <PlateElement as="div" {...props} />;
}

function HrElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div contentEditable={false} className="py-2">
        <hr className="border-border" />
      </div>
      {props.children}
    </PlateElement>
  );
}

// --- Table ---------------------------------------------------------------

function TableElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="table"
      className="my-3 w-full border-collapse text-sm"
      {...props}
    >
      <tbody>{props.children}</tbody>
    </PlateElement>
  );
}

function TableRowElement(props: PlateElementProps) {
  return <PlateElement as="tr" {...props} />;
}

function TableHeaderCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="th"
      className="border border-border px-3 py-1.5 text-left align-top font-semibold"
      {...props}
    />
  );
}

function TableCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="td"
      className="border border-border px-3 py-1.5 align-top"
      {...props}
    />
  );
}

// --- Inline link ---------------------------------------------------------

function LinkElement(props: PlateElementProps) {
  const url = (props.element as { url?: string }).url;
  return (
    <PlateElement
      as="a"
      className="font-medium text-primary underline underline-offset-2"
      {...props}
      attributes={{
        ...props.attributes,
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
      }}
    />
  );
}

// --- Paragraph + indent-list item ----------------------------------------

function ParagraphElement(props: PlateElementProps) {
  const el = props.element as ListProps;

  if (el.listStyleType) {
    const indent = el.indent ?? 1;
    const padRem = indent * 1.5;
    const marker =
      el.listStyleType === "decimal" ? `${el.listStart ?? 1}.` : "•";
    return (
      <PlateElement
        as="div"
        className="relative my-0.5"
        style={{ paddingLeft: `${padRem}rem` }}
        {...props}
      >
        <span
          contentEditable={false}
          className="absolute select-none text-muted-foreground"
          style={{ left: `${padRem - 1.25}rem` }}
        >
          {marker}
        </span>
        {props.children}
      </PlateElement>
    );
  }

  return <PlateElement className="my-2" {...props} />;
}

// --- Leaf marks ----------------------------------------------------------

function BoldLeaf(props: PlateLeafProps) {
  return <PlateLeaf as="strong" className="font-semibold" {...props} />;
}

function ItalicLeaf(props: PlateLeafProps) {
  return <PlateLeaf as="em" {...props} />;
}

function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      as="code"
      className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
      {...props}
    />
  );
}

// --- Plugin registry -----------------------------------------------------

const elementPlugin = (key: string, component: React.FC<PlateElementProps>) =>
  createPlatePlugin({ key, node: { isElement: true, type: key, component } });

const leafPlugin = (key: string, component: React.FC<PlateLeafProps>) =>
  createPlatePlugin({ key, node: { isLeaf: true, type: key, component } });

/**
 * Render plugins for the UI editor. Additive only — they attach components to
 * the node types mdToPlate already produces and never alter serialization.
 * Register alongside (after) MarkdownPlugin in the usePlateEditor plugins array.
 */
export const renderKit = [
  // Override the paragraph component to also render indent-list items.
  ParagraphPlugin.withComponent(ParagraphElement),

  elementPlugin("h1", H1Element),
  elementPlugin("h2", H2Element),
  elementPlugin("h3", H3Element),
  elementPlugin("blockquote", BlockquoteElement),
  elementPlugin("code_block", CodeBlockElement),
  elementPlugin("code_line", CodeLineElement),
  elementPlugin("table", TableElement),
  elementPlugin("tr", TableRowElement),
  elementPlugin("th", TableHeaderCellElement),
  elementPlugin("td", TableCellElement),

  createPlatePlugin({
    key: "hr",
    node: { isElement: true, isVoid: true, type: "hr", component: HrElement },
  }),
  createPlatePlugin({
    key: "a",
    node: { isElement: true, isInline: true, type: "a", component: LinkElement },
  }),

  leafPlugin("bold", BoldLeaf),
  leafPlugin("italic", ItalicLeaf),
  leafPlugin("code", CodeLeaf),
];
