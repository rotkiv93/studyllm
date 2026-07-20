import { IconX } from "./icons";
import { estimateTokenCount } from "../lib/tokenize";
import { useT, type MessageKey, type TranslateFn } from "../lib/i18n";

/**
 * The "Chat lab" — an in-chat control panel that lets a student steer the *real* conversation the
 * same way an engineer would: give the model a standing system prompt and turn the decoding knobs
 * (temperature / top-p / max tokens). Unlike the Explore playgrounds (which run throwaway probes),
 * these settings apply to the actual messages sent in this chat and are saved per-conversation.
 *
 * Each hyperparameter is opt-in: left unchecked it stays at the model/provider default (persisted as
 * null), so a student sees exactly which knobs they've touched. Labels lead with a plain-language
 * name and keep the real term in parentheses — same convention as the rest of the student UI.
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

/** Whether the student has customised anything — drives the "on" dot on the composer toggle. */
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

/** The default value a knob jumps to the moment a student enables it. */
const ENABLE_DEFAULTS = { temperature: 0.7, topP: 0.9, maxTokens: 512 };

interface KnobProps {
  t: TranslateFn;
  labelKey: MessageKey;
  termKey: MessageKey;
  explainKey: MessageKey;
  min: number;
  max: number;
  step: number;
  value: number | null;
  enableDefault: number;
  format?: (v: number) => string;
  onChange: (v: number | null) => void;
}

function Knob({ t, labelKey, termKey, explainKey, min, max, step, value, enableDefault, format, onChange }: KnobProps) {
  const on = value != null;
  const shown = value ?? enableDefault;
  return (
    <div className={`lab-knob${on ? " lab-knob-on" : ""}`}>
      <div className="lab-knob-head">
        <label className="lab-knob-toggle">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(e.currentTarget.checked ? enableDefault : null)}
          />
          <span className="lab-knob-label">
            {t(labelKey)} <span className="lab-knob-term">({t(termKey)})</span>
          </span>
        </label>
        <span className="lab-knob-value">
          {on ? (format ? format(shown) : String(shown)) : t("chatLab.default")}
        </span>
      </div>
      <input
        type="range"
        className="lab-knob-range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={!on}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <p className="lab-knob-explain">{t(explainKey)}</p>
    </div>
  );
}

export function ChatLab({
  settings,
  onChange,
  onClose,
}: {
  settings: ChatSettings;
  onChange: (next: ChatSettings) => void;
  onClose: () => void;
}) {
  const t = useT();
  const set = (patch: Partial<ChatSettings>) => onChange({ ...settings, ...patch });
  const systemTokens = estimateTokenCount(settings.systemPrompt);

  return (
    <div className="chat-lab">
      <div className="chat-lab-head">
        <div>
          <strong>{t("chatLab.title")}</strong>
          <span className="chat-lab-sub">{t("chatLab.subtitle")}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t("chatLab.close")}>
          <IconX size={14} />
        </button>
      </div>

      <div className="lab-field">
        <div className="lab-field-head">
          <label className="lab-knob-label" htmlFor="lab-system">
            {t("chatLab.standingInstructions")}{" "}
            <span className="lab-knob-term">{t("chatLab.systemPromptTerm")}</span>
          </label>
          <span className="lab-knob-value">{t("chatLab.tokens", { count: systemTokens })}</span>
        </div>
        <div className="lab-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => set({ systemPrompt: p.text })}
            >
              {t(p.labelKey)}
            </button>
          ))}
          {settings.systemPrompt.trim() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm lab-preset-clear"
              onClick={() => set({ systemPrompt: "" })}
            >
              {t("chatLab.clear")}
            </button>
          )}
        </div>
        <textarea
          id="lab-system"
          className="explore-query-input"
          value={settings.systemPrompt}
          onChange={(e) => set({ systemPrompt: e.currentTarget.value })}
          rows={3}
          placeholder={t("chatLab.systemPlaceholder")}
        />
        <p className="lab-knob-explain">{t("chatLab.systemExplain")}</p>
      </div>

      <div className="lab-knobs">
        <Knob
          t={t}
          labelKey="chatLab.knob.creativity"
          termKey="chatLab.knob.creativityTerm"
          explainKey="chatLab.knob.creativityExplain"
          min={0}
          max={2}
          step={0.1}
          value={settings.temperature}
          enableDefault={ENABLE_DEFAULTS.temperature}
          format={(v) => v.toFixed(1)}
          onChange={(v) => set({ temperature: v })}
        />
        <Knob
          t={t}
          labelKey="chatLab.knob.variety"
          termKey="chatLab.knob.varietyTerm"
          explainKey="chatLab.knob.varietyExplain"
          min={0}
          max={1}
          step={0.05}
          value={settings.topP}
          enableDefault={ENABLE_DEFAULTS.topP}
          format={(v) => v.toFixed(2)}
          onChange={(v) => set({ topP: v })}
        />
        <Knob
          t={t}
          labelKey="chatLab.knob.length"
          termKey="chatLab.knob.lengthTerm"
          explainKey="chatLab.knob.lengthExplain"
          min={64}
          max={4096}
          step={64}
          value={settings.maxTokens}
          enableDefault={ENABLE_DEFAULTS.maxTokens}
          onChange={(v) => set({ maxTokens: v == null ? null : Math.round(v) })}
        />
      </div>
    </div>
  );
}
