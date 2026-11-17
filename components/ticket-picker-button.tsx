import { useComposer } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { focusTicketBar } from "@/components/ticket-bar";

/** New-thread composer action that jumps to the ticket bar above the composer. */
export function TicketPickerButton() {
  const composer = useComposer();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      aria-label="Link a Linear ticket"
      onClick={() => focusTicketBar(composer.key)}
    >
      <Icon name="Layers" className="size-4" />
    </Button>
  );
}
