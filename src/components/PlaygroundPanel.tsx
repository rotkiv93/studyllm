import { useEffect, useState, type ReactNode } from "react";
import {
  IconBook,
  IconChevronDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconLoader,
  IconMessage,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTool,
} from "./icons";
import { RESEARCH_MODES, researchModeKeys, type ResearchMode } from "../lib/researchModes";
import { estimateTokenCount } from "../lib/tokenize";
import type { ProviderRow } from "../lib/db";
import { QuotaMeter, type QuotaSnapshot } from "./QuotaMeter";
import { useT, type MessageKey } from "../lib/i18n";

/**
 * The Lab — the bar on the right of the chat, laid out like the run-settings panel of Google AI Studio:
 * the model on top, then collapsible sections (system instructions, temperature, tools, advanced) with
 * real sliders and numeric boxes. It is always there: a narrow rail (a dot on every option that is
 * switched on) or expanded. The Course teaches what each setting does, so the panel carries no
 * explanatory prose. Settings apply to the real conversation and are saved with it.
 *
 * Every setting is opt-in: untouched means "use the provider's own default" (stored as null), shown as
 * "Auto"; moving a slider or typing a value turns it on, and the small reset arrow turns it off again.
 * Labels lead with a plain name, real term in parentheses (the student-terminology convention).
 */

export interface ChatSettings {
  /** Standing instruction prepended to every turn in this chat. "" = none. */
  systemPrompt: string;
  /** null = leave the model/provider default untouched. */
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  temperature: null,
  topP: null,
  maxTokens: null,
};

/** Whether the student has customised anything — drives the reset button. */
export function isChatSettingsActive(s: ChatSettings): boolean {
  return (
    s.systemPrompt.trim().length > 0 ||
    s.temperature != null ||
    s.topP != null ||
    s.maxTokens != null
  );
}

/**
 * System-prompt presets. Only the chip *label* is localized — `text` is the system prompt handed to
 * the model, so it stays untranslated English (i18n here is interface-level only). The student can
 * rewrite the inserted prompt in any language before sending.
 */
const PRESETS: { id: string; labelKey: MessageKey; text: string }[] = [
  {
    id: "tutor",
    labelKey: "chatLab.preset.tutor",
    text: "You are a patient tutor. Explain simply, use short examples, and check understanding.",
  },
  {
    id: "pirate",
    labelKey: "chatLab.preset.pirate",
    text: "You are a pirate. Answer everything in pirate slang.",
  },
  {
    id: "oneWord",
    labelKey: "chatLab.preset.oneWord",
    text: "Answer every question in exactly one word. Never more.",
  },
  {
    id: "french",
    labelKey: "chatLab.preset.french",
    text: "Always respond in French, regardless of the language asked.",
  },
  {
    id: "eli10",
    labelKey: "chatLab.preset.eli10",
    text: "Explain everything as if to a curious 10-year-old: plain words, a friendly tone, and a simple analogy.",
  },
];

/** What the slider shows before the student touches it (the provider keeps its own default). */
const SLIDER_REST = { temperature: 0.7, topP: 0.9 };

export interface PlaygroundPanelProps {
  /** Expanded panel (true) or the narrow rail (false). */
  expanded: boolean;
  onToggle: () => void;
  settings: ChatSettings;
  onChange: (next: ChatSettings) => void;
  providers: ProviderRow[];
  quota: QuotaSnapshot;
  /** The provider (and model) pinned for this chat; a null provider means automatic, in list order. */
  target: { providerId: string | null; model: string | null };
  onTarget: (next: { providerId: string | null; model: string | null }) => void;
  /** Live model ids for a provider, or null when it can't list them. */
  loadModels: (providerId: string) => Promise<string[] | null>;
  researchMode: ResearchMode | null;
  onResearchMode: (mode: ResearchMode | null) => void;
  hasResearchTools: boolean;
  installingResearchTools: boolean;
  onInstallResearchTools: () => void;
  useLibrary: boolean;
  onUseLibrary: (on: boolean) => void;
  documentCount: number;
  onOpenLibrary: () => void;
  /** A reply is streaming — the tool toggles wait until it ends. */
  busy: boolean;
}

function Switch({
  on,
  disabled,
  onToggle,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`play-switch${on ? " play-switch-on" : ""}`}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="play-switch-knob" />
    </button>
  );
}

/** A collapsible block with a chevron, like the sections of AI Studio's panel. */
function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`play-section${open ? " play-section-open" : ""}`}>
      <button type="button" className="play-section-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{title}</span>
        <IconChevronDown size={15} />
      </button>
      {open && <div className="play-section-body">{children}</div>}
    </section>
  );
}

/** Slider + numeric box. `value === null` shows "Auto" and a muted thumb; the reset arrow returns to it. */
function SliderField({
  label,
  term,
  showLabel = true,
  inline = false,
  value,
  rest,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  term?: string;
  /** false: the section title already says it — the label stays for screen readers only. */
  showLabel?: boolean;
  /** Slider and number on one row, with no label row above. */
  inline?: boolean;
  value: number | null;
  rest: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number | null) => void;
}) {
  const t = useT();
  const auto = value == null;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // What the student is typing, before it is a valid in-range number. Clamping every keystroke would
  // turn "1200" into 64 → 642 → 4096 on the way; so out-of-range text waits and is clamped on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const slider = (
    <input
      className={`play-slider${auto ? " play-slider-auto" : ""}`}
      type="range"
      min={min}
      max={max}
      step={step}
      value={auto ? rest : value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  );
  const reset = !auto && (
    <button
      type="button"
      className="play-reset"
      onClick={() => onChange(null)}
      title={t("lab.useDefault")}
      aria-label={t("lab.useDefault")}
    >
      <IconRefresh size={12} />
    </button>
  );
  const box = (
    <input
      className="play-num"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? (auto ? "" : value)}
      placeholder={t("lab.auto")}
      aria-label={label}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        setDraft(raw);
        if (raw === "") return onChange(null);
        const n = Number(raw);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        if (draft !== null && draft !== "" && Number.isFinite(Number(draft))) onChange(clamp(Number(draft)));
        setDraft(null);
      }}
    />
  );
  if (inline) {
    return (
      <div className="play-inline">
        {slider}
        {reset}
        {box}
      </div>
    );
  }
  return (
    <div className="play-field">
      <div className="play-field-head">
        <span className="play-label">
          {showLabel && (
            <>
              {label} {term && <span className="play-term">({term})</span>}
            </>
          )}
        </span>
        {reset}
        {box}
      </div>
      {slider}
    </div>
  );
}

/**
 * The provider and model the chat uses. "Automatic" follows the order of the provider list (with
 * failover); picking a provider pins it for this chat, and the model list is that provider's live one.
 * A small pill says when the router (OmniRoute) is the one answering.
 */
function ModelPicker({
  providers,
  quota,
  target,
  onTarget,
  loadModels,
}: {
  providers: ProviderRow[];
  quota: QuotaSnapshot;
  target: { providerId: string | null; model: string | null };
  onTarget: (next: { providerId: string | null; model: string | null }) => void;
  loadModels: (providerId: string) => Promise<string[] | null>;
}) {
  const t = useT();
  const enabled = [...providers].filter((p) => p.enabled).sort((a, b) => a.priority - b.priority);
  // In OmniRoute mode that router is the only provider: it is always "pinned", with no dropdown.
  const forced = enabled.length === 1 && enabled[0].type === "omniroute" ? enabled[0] : undefined;
  const pinned = forced ?? enabled.find((p) => p.id === target.providerId);
  const active = pinned ?? enabled[0];
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const pinnedId = pinned?.id;

  useEffect(() => {
    if (!pinnedId) return;
    let live = true;
    void loadModels(pinnedId).then((list) => {
      if (live) {
        setModels(list);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [pinnedId, loadModels]);

  const model = target.model ?? pinned?.model ?? "";
  const options = models ? Array.from(new Set([model, ...models].filter(Boolean))) : model ? [model] : [];

  function pickProvider(id: string) {
    setModels(null);
    setLoading(id !== "");
    onTarget({ providerId: id || null, model: null });
  }

  return (
    <div className="play-model">
      <div className="play-model-row">
        <label className="play-model-label" htmlFor="play-provider">
          {t("lab.provider")}
        </label>
        {forced ? (
          <span className="play-model-name">{forced.label}</span>
        ) : (
          <select id="play-provider" className="play-select" value={pinned?.id ?? ""} onChange={(e) => pickProvider(e.currentTarget.value)}>
            <option value="">{t("lab.autoProvider")}</option>
            {enabled.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="play-model-row">
        <label className="play-model-label" htmlFor="play-model">
          {t("lab.model")}
        </label>
        {pinned ? (
          <select
            id="play-model"
            className="play-select"
            value={model}
            disabled={loading && options.length === 0}
            onChange={(e) => onTarget({ providerId: pinned.id, model: e.currentTarget.value })}
          >
            {options.length === 0 && <option value="">{t("lab.loadingModels")}</option>}
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <span className="play-model-name" title={t("lab.modelTitle")}>
            {active ? active.model : t("lab.noModel")}
          </span>
        )}
      </div>
      {active && active.type !== "omniroute" && (
        <QuotaMeter type={active.type} requests={quota.requests[active.id] ?? 0} cooldownUntil={quota.cooldowns[active.id]} />
      )}
      {active?.type === "omniroute" && <span className="play-pill">{t("lab.usingOmni")}</span>}
    </div>
  );
}

export function PlaygroundPanel({
  expanded,
  onToggle,
  settings,
  onChange,
  providers,
  quota,
  target,
  onTarget,
  loadModels,
  researchMode,
  onResearchMode,
  hasResearchTools,
  installingResearchTools,
  onInstallResearchTools,
  useLibrary,
  onUseLibrary,
  documentCount,
  onOpenLibrary,
  busy,
}: PlaygroundPanelProps) {
  const t = useT();
  const set = (patch: Partial<ChatSettings>) => onChange({ ...settings, ...patch });
  const customised = isChatSettingsActive(settings);

  if (!expanded) {
    // The rail: one button per section, lit up when something in it is switched on.
    const rail = [
      { id: "system", icon: IconMessage, on: settings.systemPrompt.trim().length > 0, label: t("lab.system") },
      { id: "temperature", icon: IconSettings, on: settings.temperature != null, label: t("lab.temperature") },
      { id: "tools", icon: IconTool, on: !!researchMode || useLibrary, label: t("lab.tools") },
      { id: "advanced", icon: IconSearch, on: settings.topP != null || settings.maxTokens != null, label: t("lab.advanced") },
    ];
    return (
      <aside className="play-panel play-panel-collapsed" aria-label={t("lab.title")}>
        <button
          type="button"
          className="btn btn-ghost btn-icon play-toggle"
          onClick={onToggle}
          title={t("lab.expand")}
          aria-label={t("lab.expand")}
          aria-expanded={false}
        >
          <IconChevronsLeft size={16} />
        </button>
        {rail.map(({ id, icon: Icon, on, label }) => (
          <button
            key={id}
            type="button"
            className={`play-rail-btn${on ? " play-rail-btn-on" : ""}`}
            onClick={onToggle}
            title={label}
            aria-label={label}
          >
            <Icon size={17} />
            {on && <span className="play-rail-dot" aria-hidden="true" />}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="play-panel" aria-label={t("lab.title")}>
      <header className="play-head">
        <strong>{t("lab.title")}</strong>
        <div className="play-head-actions">
          {customised && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => onChange(DEFAULT_CHAT_SETTINGS)}
              title={t("lab.reset")}
              aria-label={t("lab.reset")}
            >
              <IconRefresh size={15} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon play-toggle"
            onClick={onToggle}
            title={t("lab.collapse")}
            aria-label={t("lab.collapse")}
            aria-expanded
          >
            <IconChevronsRight size={16} />
          </button>
        </div>
      </header>

      <div className="play-body">
        <ModelPicker providers={providers} quota={quota} target={target} onTarget={onTarget} loadModels={loadModels} />

        <Section title={t("lab.system")}>
          <div className="play-inline">
            <select
              className="play-select"
              value={PRESETS.find((p) => p.text === settings.systemPrompt)?.id ?? ""}
              onChange={(e) => {
                const preset = PRESETS.find((p) => p.id === e.currentTarget.value);
                set({ systemPrompt: preset ? preset.text : settings.systemPrompt });
              }}
              aria-label={t("lab.template")}
            >
              <option value="">{t("lab.template")}</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
            <span className="play-count">{t("lab.tokens", { count: estimateTokenCount(settings.systemPrompt) })}</span>
          </div>
          <textarea
            className="explore-query-input play-textarea"
            value={settings.systemPrompt}
            onChange={(e) => set({ systemPrompt: e.currentTarget.value })}
            rows={2}
            placeholder={t("lab.personaPlaceholder")}
            aria-label={t("lab.system")}
          />
        </Section>

        <Section title={t("lab.temperature")}>
          <SliderField
            label={t("chatLab.knob.creativity")}
            showLabel={false}
            inline
            value={settings.temperature}
            rest={SLIDER_REST.temperature}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ temperature: v })}
          />
        </Section>

        <Section title={t("lab.tools")}>
          <div className="play-row" title={t("composer.deepResearchTitle")}>
            <span className="play-row-name">
              <IconSearch size={14} /> {t("composer.deepResearch")}
            </span>
            <Switch
              on={!!researchMode}
              disabled={busy}
              label={t("composer.deepResearch")}
              onToggle={() => onResearchMode(researchMode ? null : RESEARCH_MODES[0])}
            />
          </div>
          {researchMode && (
            <div className="play-sub-row">
              <select
                className="composer-mode-select"
                value={researchMode.id}
                onChange={(e) => onResearchMode(RESEARCH_MODES.find((r) => r.id === e.currentTarget.value) ?? null)}
                disabled={busy}
                title={t(researchModeKeys(researchMode.id).description)}
              >
                {RESEARCH_MODES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t(researchModeKeys(r.id).label)}
                  </option>
                ))}
              </select>
              {!hasResearchTools && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onInstallResearchTools}
                  disabled={installingResearchTools}
                >
                  {installingResearchTools && <IconLoader size={12} />} {t("composer.setUpResearchTools")}
                </button>
              )}
            </div>
          )}

          <div className="play-row" title={documentCount > 0 ? t("composer.chatWithDocsOn") : t("composer.chatWithDocsOff")}>
            <span className="play-row-name">
              <IconBook size={14} /> {t("lab.docs")} <span className="play-term">(RAG)</span>
              {documentCount > 0 && <span className="composer-mode-count">{documentCount}</span>}
            </span>
            {documentCount > 0 ? (
              <Switch on={useLibrary} disabled={busy} label={t("lab.docs")} onToggle={() => onUseLibrary(!useLibrary)} />
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenLibrary}>
                {t("lab.addDocs")}
              </button>
            )}
          </div>
        </Section>

        <Section title={t("lab.advanced")} defaultOpen={false}>
          <SliderField
            label={t("lab.topP")}
            term="top-p"
            value={settings.topP}
            rest={SLIDER_REST.topP}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ topP: v })}
          />
          <SliderField
            label={t("lab.length.label")}
            term={t("chatLab.knob.lengthTerm")}
            value={settings.maxTokens}
            rest={512}
            min={64}
            max={4096}
            step={64}
            onChange={(v) => set({ maxTokens: v == null ? null : Math.round(v) })}
          />
        </Section>
      </div>
    </aside>
  );
}
