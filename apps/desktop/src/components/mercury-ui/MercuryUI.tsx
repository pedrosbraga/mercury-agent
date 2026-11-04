import { createContext, useContext, useId, useMemo, useState } from "react";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { mercuryUiCatalog, validateUiSpec, type UiProps } from "./spec";
import "./mercury-ui.css";

export type PreviewDraft = (text: string) => boolean;
const PreviewContext = createContext<PreviewDraft>(() => false);

function usePreview() {
  const preview = useContext(PreviewContext);
  const [feedback, setFeedback] = useState("");
  return { feedback, run: (text: string) => setFeedback(preview(text)
    ? "Added to your composer for review. Nothing was sent."
    : "Preview unavailable: this is no longer the current chat. Nothing was sent.") };
}

function Tabs({ tabs }: UiProps<"Tabs">) {
  const [active, setActive] = useState(0);
  const prefix = useId();
  return <div>
    <div role="tablist" aria-label="View tabs" className="mui-tabs">{tabs.map((t, i) => <button type="button" key={i} role="tab" id={`${prefix}-tab-${i}`} aria-selected={active === i} aria-controls={`${prefix}-panel-${i}`} tabIndex={active === i ? 0 : -1} onKeyDown={(e) => {
      const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      e.preventDefault(); setActive(next);
      document.getElementById(`${prefix}-tab-${next}`)?.focus();
    }} onClick={() => setActive(i)}>{t.label}</button>)}</div>
    {tabs.map((t, i) => <div key={i} role="tabpanel" id={`${prefix}-panel-${i}`} aria-labelledby={`${prefix}-tab-${i}`} hidden={active !== i} className="mui-content">{t.content}</div>)}
  </div>;
}
function Table({ columns, rows }: UiProps<"Table">) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => row.some((cell) => cell.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    return sort ? [...filtered].sort((a, b) => a[sort.column].localeCompare(b[sort.column], undefined, { numeric: true, sensitivity: "base" }) * (sort.descending ? -1 : 1)) : filtered;
  }, [rows, query, sort]);
  return <div>
    <label className="mui-search"><span>Filter table</span><input type="search" value={query} maxLength={240} onChange={(e) => setQuery(e.target.value)} placeholder="Search rows…" /></label>
    <p role="status" className="mui-note">{visible.length} of {rows.length} rows · filter and sort stay on this device.</p>
    <div className="mui-table"><table><thead><tr>{columns.map((c, i) => <th scope="col" key={i} aria-sort={sort?.column === i ? (sort.descending ? "descending" : "ascending") : "none"}><button type="button" onClick={() => setSort((s) => ({ column: i, descending: s?.column === i ? !s.descending : false }))}>{c}{sort?.column === i ? (sort.descending ? " ↓" : " ↑") : " ↕"}</button></th>)}</tr></thead><tbody>{visible.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
    {!visible.length && <p className="mui-note">No matching rows.</p>}
  </div>;
}
function Form({ title, fields, submitLabel }: UiProps<"Form">) {
  const [values, setValues] = useState<Record<string, string>>({});
  const preview = usePreview();
  return <form onSubmit={(e) => {
    e.preventDefault();
    // Built-in browser constraints cover required/number/date/select; never spec actions.
    if (!e.currentTarget.reportValidity()) return;
    preview.run(`${title}\n${fields.map((f) => `${f.label}: ${values[f.name] ?? ""}`).join("\n")}`);
  }}>
    <h4>{title}</h4>
    <div className="mui-fields">{fields.map((f) => <label key={f.name}>
      <span>{f.label}{f.required ? " *" : ""}</span>
      {f.type === "select" ? <select name={f.name} value={values[f.name] ?? ""} required={f.required} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
        <option value="">Choose…</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select> : <input name={f.name} type={f.type} step={f.type === "number" ? "any" : undefined} maxLength={f.type === "text" ? 4000 : undefined} required={f.required} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />}
    </label>)}</div>
    <button type="submit" className="mui-button">{submitLabel ?? "Preview in composer"}</button>
    <p className="mui-note">Preview only — review and press Send yourself in the composer.</p>
    <p role="status" className="mui-note">{preview.feedback}</p>
  </form>;
}
function PreviewButton({ label, message }: UiProps<"Button">) {
  const preview = usePreview();
  return <div><button type="button" className="mui-button" onClick={() => preview.run(message)}>{label}</button><p className="mui-note">Previews a message in your composer; does not send.</p><p role="status" className="mui-note">{preview.feedback}</p></div>;
}

const { registry } = defineRegistry(mercuryUiCatalog, {
  components: {
    Card: ({ props, children }) => <section className="mui-card"><h4>{props.title}</h4><div className="mui-stack">{children}</div></section>,
    Text: ({ props }) => <p className="mui-content">{props.text}</p>,
    Metric: ({ props }) => <div className="mui-metric"><span>{props.label}</span><strong>{props.value}</strong></div>,
    Tabs: ({ props }) => <Tabs {...props} />,
    Accordion: ({ props }) => <div>{props.items.map((item, i) => <details key={i} className="mui-disclosure"><summary>{item.title}</summary><div className="mui-content">{item.content}</div></details>)}</div>,
    BarChart: ({ props }) => {
      const max = Math.max(1, ...props.items.map((i) => i.value));
      return <div role="img" aria-label={`Bar chart: ${props.items.map((i) => `${i.label}: ${i.value}`).join(", ")}`} className="mui-stack">{props.items.map((item, i) => <div key={i} className="mui-bar-row"><span>{item.label}</span><div className="mui-bar-track"><div className="mui-bar" style={{ width: `${100 * item.value / max}%` }} /></div><span>{item.value}</span></div>)}</div>;
    },
    Table: ({ props }) => <Table {...props} />,
    Form: ({ props }) => <Form {...props} />,
    Button: ({ props }) => <PreviewButton {...props} />,
  },
});

/** Only validated static specs reach the actual open-source Renderer. */
export function MercuryUI({ raw, onPreview }: { raw: string; onPreview: PreviewDraft }) {
  const result = useMemo(() => validateUiSpec(raw), [raw]);
  if (!result.ok) return <div className="mercury-ui"><p role="note" className="mui-note">Interactive UI not rendered: {result.error}. Showing inert code instead.</p><pre><code>{raw}</code></pre></div>;
  return <div className="mercury-ui" aria-label="Interactive Mercury UI">
    <p className="mui-note">Interactive preview · local controls only. Forms and buttons prepare drafts, never send.</p>
    <PreviewContext.Provider value={onPreview}><JSONUIProvider registry={registry}><Renderer spec={result.spec} registry={registry} /></JSONUIProvider></PreviewContext.Provider>
  </div>;
}
