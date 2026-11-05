import { PanelRight } from "lucide-react";
import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { useDesk } from "./store";
import { listDeskApps, preloadDeskApp } from "./registry";

/** Header button that opens and closes the desk. Hovering it warms the apps, so opening feels instant. */
export function DeskToggle() {
  const open = useDesk((s) => s.open);
  const toggle = useDesk((s) => s.toggle);
  const warm = () => { if (!open) listDeskApps().forEach((a) => preloadDeskApp(a.id)); };
  return (
    <Tooltip label={open ? "Close workspace" : "Open workspace"} shortcut="⌘J" side="bottom">
      <Button variant="ghost" size="sm" icon onClick={toggle} onPointerEnter={warm} onFocus={warm} aria-label="Toggle workspace" aria-pressed={open}>
        <PanelRight size={16} className={open ? "text-accent" : undefined} />
      </Button>
    </Tooltip>
  );
}
