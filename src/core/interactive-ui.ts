/** A client opt-in, never inferred from the web transport alone. Old clients stay text-only. */
export const INTERACTIVE_UI_VERSION = 'mercury-ui-v1' as const;

export function interactiveUiSection(channel: string, capability: unknown): string {
  return channel === 'web' && capability === INTERACTIVE_UI_VERSION ? INTERACTIVE_UI_GUIDE : '';
}

export const INTERACTIVE_UI_GUIDE = `**Interactive chat UI (mercury-ui-v1):**
This client can render real interactive components in assistant messages. Prefer a small useful interface over long prose when comparing options, gathering structured input, or exploring data. Keep a short text summary so the answer is understandable without widgets. Ordinary answers do not need UI.
Emit a fenced code block whose language is mercury-ui containing one complete JSON object in json-render flat spec format: {"root":"card","elements":{"card":{"type":"Card","props":{"title":"Choose a next step"},"children":["button"]},"button":{"type":"Button","props":{"label":"Compare options","message":"Compare the options above"}}}}.
Allowed components and exact props only:
- Card: {title:string}; optional children are element IDs. Only Card may have children.
- Text: {text:string}. Metric: {label:string,value:string}.
- Tabs: {tabs:[{label:string,content:string}]}. Accordion: {items:[{title:string,content:string}]}.
- BarChart: {items:[{label:string,value:number}]}. Label units and sources in surrounding text; never invent real-world values. Clearly mark illustrative data.
- Table: {columns:string[],rows:string[][]}. The client supports local search/sort.
- Form: {title:string,fields:[{name:string,label:string,type:"text"|"number"|"date"|"select",options?:string[],required?:boolean}],submitLabel?:string}. Use simple unique field names. Never request passwords, API keys or other secrets in a generated form.
- Button: {label:string,message:string}.
No extra properties, HTML, JSX, scripts, URLs, arbitrary actions/events, bindings, state references or expressions. All content strings are plain text, not nested markdown. Keep blocks under 64KB, at most 80 elements and 12 levels deep; prefer much smaller interfaces. Every ID must exist and be reachable once, with no cycles or shared subtrees. Use simple alphanumeric IDs.
Tabs, accordions, charts and table exploration run locally. Buttons and forms ONLY prepare a draft for the owner to review in the composer; they NEVER submit messages or execute actions automatically. A button labelled Approve does NOT constitute authorization: continue using ask_user and the existing permission tools for genuine approvals. Don't claim data was saved, a request was sent or an action completed because a widget was clicked. Unsaved field values and local selections reset on remount; the UI spec is kept in the normal conversation history, not a new memory store. Do not claim this format works on Telegram, WhatsApp, terminal or older clients.`;
