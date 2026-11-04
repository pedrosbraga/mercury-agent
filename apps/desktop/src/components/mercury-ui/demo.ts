/** Static fixture: all nine catalog components. No actions, data bindings or URLs. */
export const mercuryUiDemo = {
  root: "demo",
  elements: {
    demo: { type: "Card", props: { title: "Mercury UI examples" }, children: ["intro", "metric", "tabs", "accordion", "bars", "table", "form", "button"] },
    intro: { type: "Text", props: { text: "Illustrative data, not live tasks. Local controls only. Forms and buttons preview text in your composer; nothing is sent automatically." } },
    metric: { type: "Metric", props: { label: "Tasks complete", value: "7 / 10" } },
    tabs: { type: "Tabs", props: { tabs: [{ label: "Overview", content: "A small, safe interactive dashboard." }, { label: "Details", content: "Everything here is literal data." }] } },
    accordion: { type: "Accordion", props: { items: [{ title: "How previews work", content: "Review the draft in your composer, edit it, and press Send yourself." }] } },
    bars: { type: "BarChart", props: { items: [{ label: "Planned", value: 10 }, { label: "Done", value: 7 }] } },
    table: { type: "Table", props: { columns: ["Task", "Status"], rows: [["Research", "Done"], ["Review", "Next"]] } },
    form: { type: "Form", props: { title: "Plan a review", fields: [{ name: "topic", label: "Topic", type: "text", required: true }, { name: "count", label: "Items", type: "number" }, { name: "date", label: "Date", type: "date" }, { name: "priority", label: "Priority", type: "select", options: ["Normal", "High"] }], submitLabel: "Preview review request" } },
    button: { type: "Button", props: { label: "Preview follow-up", message: "Help me review the remaining tasks." } },
  },
};

/** The owner chooses whether to send this request. It is not a local slash command. */
export const mercuryUiDemoPrompt = `Show me interactive Mercury UI examples. Reply with the following flat JSON spec in a closed \`\`\`mercury-ui fenced block, so I can try its local controls. Do not run tools or send anything on my behalf. Forms and buttons must only preview drafts.\n\n${JSON.stringify(mercuryUiDemo, null, 2)}`;
