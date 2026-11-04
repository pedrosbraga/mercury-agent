import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

export const MAX_UI_BYTES = 64 * 1024;
export const MAX_UI_NODES = 80;
export const MAX_UI_DEPTH = 12;
const text = z.string().max(8000);
const label = z.string().min(1).max(240);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const field = z.object({
  name: id, label, type: z.enum(["text", "number", "date", "select"]),
  options: z.array(label).min(1).max(40).optional(), required: z.boolean().optional(),
}).strict().superRefine((f, ctx) => {
  if ((f.type === "select") !== (f.options !== undefined)) ctx.addIssue({ code: "custom", message: "Only select fields require options" });
  if (f.options && new Set(f.options).size !== f.options.length) ctx.addIssue({ code: "custom", message: "Duplicate select options" });
});
export const propSchemas = {
  Card: z.object({ title: label }).strict(),
  Text: z.object({ text }).strict(),
  Metric: z.object({ label, value: z.union([text, z.number().finite()]) }).strict(),
  Tabs: z.object({ tabs: z.array(z.object({ label, content: text }).strict()).min(1).max(16) }).strict(),
  Accordion: z.object({ items: z.array(z.object({ title: label, content: text }).strict()).min(1).max(24) }).strict(),
  BarChart: z.object({ items: z.array(z.object({ label, value: z.number().finite().min(0).max(1e15) }).strict()).min(1).max(40) }).strict(),
  Table: z.object({ columns: z.array(label).min(1).max(16), rows: z.array(z.array(text).max(16)).max(100) }).strict().refine((p) => p.rows.every((r) => r.length === p.columns.length), "Each row must match columns"),
  Form: z.object({ title: label, fields: z.array(field).min(1).max(24), submitLabel: label.optional() }).strict().refine((p) => new Set(p.fields.map((f) => f.name)).size === p.fields.length, "Field names must be unique"),
  Button: z.object({ label, message: text.min(1) }).strict(),
};
export type UiProps<K extends keyof typeof propSchemas> = z.infer<(typeof propSchemas)[K]>;

/** The actual json-render catalog. No actions, expressions, bindings, URLs or event schemas. */
export const mercuryUiCatalog = defineCatalog(schema, {
  components: {
    Card: { props: propSchemas.Card, slots: ["default"], description: "Titled container; children are element IDs." },
    Text: { props: propSchemas.Text, description: "Plain text, not markdown or HTML." },
    Metric: { props: propSchemas.Metric, description: "Label and literal value." },
    Tabs: { props: propSchemas.Tabs, description: "Local tabs with plain-text content." },
    Accordion: { props: propSchemas.Accordion, description: "Local disclosures with plain-text content." },
    BarChart: { props: propSchemas.BarChart, description: "Nonnegative literal numeric bars." },
    Table: { props: propSchemas.Table, description: "Literal string columns and rows." },
    Form: { props: propSchemas.Form, description: "Local fields; submit only previews a draft for owner review." },
    Button: { props: propSchemas.Button, description: "Preview literal message in composer; never send." },
  }, actions: {},
});
const elementSchema = z.object({ type: z.enum(Object.keys(propSchemas) as [keyof typeof propSchemas, ...(keyof typeof propSchemas)[]]), props: z.record(z.string(), z.unknown()), children: z.array(id).max(MAX_UI_NODES).optional() }).strict();
const specSchema = z.object({ root: id, elements: z.record(id, elementSchema) }).strict();
export type UiValidation = { ok: true; spec: Spec } | { ok: false; error: string };

/** Bound raw nesting BEFORE JSON.parse and recursive schema processing. Strings are inert. */
function checkJsonDepth(raw: string) {
  let depth = 0, quoted = false, escaped = false;
  for (const c of raw) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") { if (++depth > MAX_UI_DEPTH) throw new Error("JSON nesting exceeds depth 12"); }
    else if (c === "}" || c === "]") depth--;
  }
}

export function validateUiSpec(raw: string): UiValidation {
  try {
    if (raw.length > MAX_UI_BYTES || new TextEncoder().encode(raw).length > MAX_UI_BYTES) throw new Error("UI exceeds 64 KB");
    checkJsonDepth(raw);
    const parsed: unknown = JSON.parse(raw, (key, value: unknown) => {
      if (key.startsWith("$") || ["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Dynamic references and unsafe keys are not supported");
      return value;
    });
    const result = specSchema.safeParse(parsed);
    if (!result.success) throw new Error("Expected only {root,elements} and whitelisted {type,props,children?} elements");
    const spec = result.data;
    const keys = Object.keys(spec.elements);
    if (!keys.length || keys.length > MAX_UI_NODES) throw new Error("UI must contain 1–80 elements");
    if (!Object.hasOwn(spec.elements, spec.root)) throw new Error("Root element is missing");
    for (const [key, el] of Object.entries(spec.elements)) {
      const props = propSchemas[el.type].safeParse(el.props);
      if (!props.success) throw new Error(`Invalid ${el.type} props at ${key}: literal catalog props only; no extra properties`);
      if (el.type !== "Card" && el.children?.length) throw new Error("Only Card accepts child elements; tab/accordion content is plain text");
    }
    const visited = new Set<string>(), visiting = new Set<string>();
    function visit(key: string, depth: number) {
      if (depth > MAX_UI_DEPTH) throw new Error("Element tree exceeds depth 12");
      if (visiting.has(key)) throw new Error("Cyclic children are not allowed");
      if (visited.has(key)) throw new Error("Elements must form a tree, not shared children");
      if (!Object.hasOwn(spec.elements, key)) throw new Error(`Missing child element: ${key}`);
      visiting.add(key);
      for (const child of spec.elements[key].children ?? []) visit(child, depth + 1);
      visiting.delete(key); visited.add(key);
    }
    visit(spec.root, 1);
    if (visited.size !== keys.length) throw new Error("Unreachable elements are not allowed");
    return { ok: true, spec };
  } catch (err) {
    return { ok: false, error: err instanceof SyntaxError ? "Invalid JSON; waiting for a complete valid spec" : err instanceof Error ? err.message : "Invalid UI spec" };
  }
}

/** Markdown parsers close unfinished fences at EOF. Require a REAL closing fence. */
export function isClosedUiFence(source: string): boolean {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const opening = /^ {0,3}(`{3,})mercury-ui[ \t]*$/.exec(lines[0] ?? "");
  if (!opening || lines.length < 2) return false;
  return new RegExp(`^ {0,3}\x60{${opening[1].length},}[ \\t]*$`).test(lines[lines.length - 1]);
}
