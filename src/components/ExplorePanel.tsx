import { useState } from "react";
import { IconCompass } from "./icons";
import { RetrievalExplorer } from "./RetrievalExplorer";
import { ResearchTrace } from "./ResearchTrace";
import type { ResearchMode } from "../lib/researchModes";
import type { StreamEvent } from "../lib/providerRouter";
import type { ProviderRow, RagDocumentRow } from "../lib/db";

/**
 * "Explore how it works" — a hands-on playground for the app's research features, so students can
 * see the machinery instead of just its output. Follows the shared panel convention
 * (`settings-overlay` > `settings-panel`, `.settings-header`, `.mcp-tabs`).
 *
 *   • Retrieval — run a query against your library and watch RAG rank + map the passages.
 *   • Research process — (coming soon) watch a live Deep Research run unfold step by step.
 */

type Tab = "retrieval" | "research";

interface ExplorePanelProps {
  providers: ProviderRow[];
  documents: RagDocumentRow[];
  onOpenLibrary: () => void;
  onClose: () => void;
  hasResearchTools: boolean;
  installingResearchTools: boolean;
  onInstallResearchTools: () => Promise<void>;
  onRunResearch: (
    question: string,
    mode: ResearchMode,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

export function ExplorePanel({
  providers,
  documents,
  onOpenLibrary,
  onClose,
  hasResearchTools,
  installingResearchTools,
  onInstallResearchTools,
  onRunResearch,
}: ExplorePanelProps) {
  const [tab, setTab] = useState<Tab>("retrieval");

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide settings-panel-tall">
        <div className="settings-header">
          <h2>
            <IconCompass size={18} /> Explore how it works
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mcp-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "retrieval"}
            className={`mcp-tab-btn${tab === "retrieval" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("retrieval")}
          >
            Retrieval (your documents)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "research"}
            className={`mcp-tab-btn${tab === "research" ? " mcp-tab-btn-active" : ""}`}
            onClick={() => setTab("research")}
          >
            Research process
          </button>
        </div>

        {tab === "retrieval" ? (
          <RetrievalExplorer providers={providers} documents={documents} onOpenLibrary={onOpenLibrary} />
        ) : (
          <ResearchTrace
            hasResearchTools={hasResearchTools}
            installingTools={installingResearchTools}
            onInstallTools={onInstallResearchTools}
            onRun={onRunResearch}
          />
        )}
      </div>
    </div>
  );
}
