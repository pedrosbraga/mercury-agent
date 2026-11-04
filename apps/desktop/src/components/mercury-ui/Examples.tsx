import { useCallback, useState } from "react";
import { Dialog } from "~/components/ui/Dialog";
import { MercuryUI, type PreviewDraft } from "./MercuryUI";
import { mercuryUiDemo } from "./demo";

const rawDemo = JSON.stringify(mercuryUiDemo);

/** A real, offline playground. Opening it does not call the agent or send a turn. */
export function UiExamples({ onPreview }: { onPreview: PreviewDraft }) {
  const [open, setOpen] = useState(false);
  const preview = useCallback((text: string) => {
    const accepted = onPreview(text);
    if (accepted) setOpen(false);
    return accepted;
  }, [onPreview]);
  return <>
    <button type="button" className="h-8 rounded-md px-2 text-xs text-ink3 hover:bg-ink/[0.06]" aria-label="Open interactive UI examples" onClick={() => setOpen(true)}>UI examples</button>
    <Dialog open={open} onOpenChange={setOpen} width={680} title="Interactive UI examples" description="Illustrative data only. Explore tabs, disclosures, table sorting and filtering, or prepare a draft. No AI request is needed.">
      <MercuryUI raw={rawDemo} onPreview={preview} />
    </Dialog>
  </>;
}
