import { IconX } from "./icons";
import { estimateTokenCount } from "../lib/tokenize";

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

const PRESETS: { label: string; text: string }[] = [
  { label: "Friendly tutor", text: "You are a patient tutor. Explain simply, use short examples, and check understanding." },
  { label: "Talk like a pirate", text: "You are a pirate. Answer everything in pirate slang." },
  { label: "One word only", text: "Answer every question in exactly one word. Never more." },
  { label: "Reply in French", text: "Always respond in French, regardless of the language asked." },
  {
    label: "Explain like I'm 10",
    text: "Explain everything as if to a curious 10-year-old: plain words, a friendly tone, and a simple analogy.",
  },
];

/** The default value a knob jumps to the moment a student enables it. */
const ENABLE_DEFAULTS = { temperature: 0.7, topP: 0.9, maxTokens: 512 };

interface KnobProps {
  label: string;
  term: string;
  explain: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  enableDefault: number;
  format?: (v: number) => string;
  onChange: (v: number | null) => void;
}

function Knob({ label, term, explain, min, max, step, value, enableDefault, format, onChange }: KnobProps) {
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
            {label} <span className="lab-knob-term">({term})</span>
          </span>
        </label>
        <span className="lab-knob-value">{on ? (format ? format(shown) : String(shown)) : "default"}</span>
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
      <p className="lab-knob-explain">{explain}</p>
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
  const set = (patch: Partial<ChatSettings>) => onChange({ ...settings, ...patch });
  const systemTokens = estimateTokenCount(settings.systemPrompt);

  return (
    <div className="chat-lab">
      <div className="chat-lab-head">
        <div>
          <strong>Chat lab</strong>
          <span className="chat-lab-sub">
            Steer this conversation like an engineer would — a standing instruction and the model's
            dials. Applies to your real messages and is saved with this chat.
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close chat lab">
          <IconX size={14} />
        </button>
      </div>

      <div className="lab-field">
        <div className="lab-field-head">
          <label className="lab-knob-label" htmlFor="lab-system">
            Standing instructions <span className="lab-knob-term">(system prompt)</span>
          </label>
          <span className="lab-knob-value">{systemTokens} tokens</span>
        </div>
        <div className="lab-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => set({ systemPrompt: p.text })}
            >
              {p.label}
            </button>
          ))}
          {settings.systemPrompt.trim() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm lab-preset-clear"
              onClick={() => set({ systemPrompt: "" })}
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          id="lab-system"
          className="explore-query-input"
          value={settings.systemPrompt}
          onChange={(e) => set({ systemPrompt: e.currentTarget.value })}
          rows={3}
          placeholder="e.g. You are a patient tutor. Explain simply and check understanding."
        />
        <p className="lab-knob-explain">
          Hidden instructions the model follows before it sees your message — its persona and rules.
        </p>
      </div>

      <div className="lab-knobs">
        <Knob
          label="Creativity"
          term="temperature"
          explain="Low = focused and repeatable. High = more surprising and varied (and more likely to wander)."
          min={0}
          max={2}
          step={0.1}
          value={settings.temperature}
          enableDefault={ENABLE_DEFAULTS.temperature}
          format={(v) => v.toFixed(1)}
          onChange={(v) => set({ temperature: v })}
        />
        <Knob
          label="Word variety"
          term="top-p"
          explain="Limits word choice to the most likely options. Lower = safer, more predictable wording."
          min={0}
          max={1}
          step={0.05}
          value={settings.topP}
          enableDefault={ENABLE_DEFAULTS.topP}
          format={(v) => v.toFixed(2)}
          onChange={(v) => set({ topP: v })}
        />
        <Knob
          label="Response length limit"
          term="max tokens"
          explain="A hard cap on how much the model may write. Set it low and long answers get cut off mid-sentence."
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
