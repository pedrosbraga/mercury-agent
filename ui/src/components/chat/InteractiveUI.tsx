/** Shared audited renderer: the web dashboard and desktop use the same catalog. */
export { MercuryUI, type PreviewDraft } from "@mercury-ui/MercuryUI";
export { isClosedUiFence } from "@mercury-ui/spec";
import { useState } from "react";
import { MercuryUI, type PreviewDraft } from "@mercury-ui/MercuryUI";
import { mercuryUiDemo } from "@mercury-ui/demo";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import "./interactive-ui.css";

export function UiExamples({ onPreview }: { onPreview: PreviewDraft }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted" aria-label="Open interactive UI examples">Exemplos interativos</button></DialogTrigger>
    <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
      <DialogTitle>Exemplos interativos</DialogTitle>
      <DialogDescription>Dados ilustrativos. Explore abas, tabela e formulário sem consultar a IA ou enviar mensagens.</DialogDescription>
      <MercuryUI raw={JSON.stringify(mercuryUiDemo)} onPreview={(text) => {
        const accepted = onPreview(text);
        if (accepted) setOpen(false);
        return accepted;
      }} />
    </DialogContent>
  </Dialog>;
}
