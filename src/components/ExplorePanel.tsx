import { useState } from "react";
import { IconCompass } from "./icons";
import { LessonsPanel } from "./LessonsPanel";
import { TokenExplorer } from "./TokenExplorer";
import { PromptPlayground } from "./PromptPlayground";
import { RetrievalExplorer } from "./RetrievalExplorer";
import { GroundingContrast } from "./GroundingContrast";
import { McpToolExplorer, type ExplorerServer } from "./McpToolExplorer";
import { ResearchTrace } from "./ResearchTrace";
import type { ResearchMode } from "../lib/researchModes";
import type { StreamEvent } from "../lib/providerRouter";
import type { ProviderRow, RagDocumentRow } from "../lib/db";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * "Explore how it works" — a hands-on playground for the concepts a non-technical student keeps
 * hearing about (tokens, RAG, tools, research), so they can see the machinery instead of just its
 * output. The "Lessons" tab is a guided tour that drops into each playground; the rest run the app's
 * *real* pipelines (same embeddings / same provider router / same MCP tools the chat uses).
 */

export type ExploreTab =
  | "lessons"
  | "tokens"
  | "system"
  | "retrieval"
  | "grounding"
  | "tools"
  | "research";

const TABS: { id: ExploreTab; labelKey: MessageKey }[] = [
  { id: "lessons", labelKey: "explore.tab.lessons" },
  { id: "tokens", labelKey: "explore.tab.tokens" },
  { id: "system", labelKey: "explore.tab.system" },
  { id: "retrieval", labelKey: "explore.tab.retrieval" },
  { id: "grounding", labelKey: "explore.tab.grounding" },
  { id: "tools", labelKey: "explore.tab.tools" },
  { id: "research", labelKey: "explore.tab.research" },
];

interface ExplorePanelProps {
  providers: ProviderRow[];
  documents: RagDocumentRow[];
  onOpenLibrary: () => void;
  onClose: () => void;
  hasProviders: boolean;
  hasResearchTools: boolean;
  installingResearchTools: boolean;
  onInstallResearchTools: () => Promise<void>;
  toolServers: ExplorerServer[];
  onRunToolProbe: (
    question: string,
    serverId: string,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  onRunAnswer: (
    question: string,
    system: string | undefined,
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
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
  hasProviders,
  hasResearchTools,
  installingResearchTools,
  onInstallResearchTools,
  toolServers,
  onRunToolProbe,
  onRunAnswer,
  onRunResearch,
}: ExplorePanelProps) {
  const t = useT();
  const [tab, setTab] = useState<ExploreTab>("lessons");

  return (
    <div className="settings-overlay">
      <div className="settings-panel settings-panel-wide settings-panel-tall">
        <div className="settings-header">
          <h2>
            <IconCompass size={18} /> {t("explore.title")}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="mcp-tabs explore-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`mcp-tab-btn${tab === item.id ? " mcp-tab-btn-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        {tab === "lessons" && <LessonsPanel onGoTo={setTab} />}
        {tab === "tokens" && <TokenExplorer />}
        {tab === "system" && (
          <PromptPlayground hasProviders={hasProviders} onRunAnswer={onRunAnswer} />
        )}
        {tab === "retrieval" && (
          <RetrievalExplorer providers={providers} documents={documents} onOpenLibrary={onOpenLibrary} />
        )}
        {tab === "grounding" && (
          <GroundingContrast
            providers={providers}
            documents={documents}
            onOpenLibrary={onOpenLibrary}
            onRunAnswer={onRunAnswer}
          />
        )}
        {tab === "tools" && (
          <McpToolExplorer servers={toolServers} hasProviders={hasProviders} onRunToolProbe={onRunToolProbe} />
        )}
        {tab === "research" && (
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
