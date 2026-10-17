import { useEffect } from "react";

/**
 * Closes a `settings-overlay` panel on Escape. When another overlay is stacked on top (the marketplace
 * inside the tools panel, the passage dialog), that one owns Escape and this one stays open.
 */
export function useEscapeClose(onClose: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelectorAll(".settings-overlay").length > 1) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}
