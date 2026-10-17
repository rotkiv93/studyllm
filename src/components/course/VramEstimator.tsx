import { useState } from "react";
import { estimateVramGb, hardwareTierFor, type Quantization } from "../../lib/course/estimates";
import { useT, type MessageKey } from "../../lib/i18n";

/**
 * "Will it fit on my computer?" — model size × precision → GPU memory (VRAM), then which kind of
 * machine that means. Makes the slide's "7B ≈ 4–8 GB, 70B ≈ 40 GB" concrete and explorable.
 */

const PRESETS = [3, 7, 13, 70, 400];
const PRECISIONS: { bits: Quantization; labelKey: MessageKey }[] = [
  { bits: 16, labelKey: "course.vram.p16" },
  { bits: 8, labelKey: "course.vram.p8" },
  { bits: 4, labelKey: "course.vram.p4" },
];

export function VramEstimator() {
  const t = useT();
  const [params, setParams] = useState(7);
  const [bits, setBits] = useState<Quantization>(4);

  const gb = estimateVramGb(params, bits);
  const tier = hardwareTierFor(gb);

  return (
    <div className="course-demo">
      <p className="settings-hint">{t("course.vram.intro")}</p>

      <div className="course-demo-row">
        <label className="course-demo-field">
          {t("course.vram.params")}
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={params}
            onChange={(e) => setParams(Number(e.currentTarget.value))}
          />
        </label>
        <div className="course-demo-presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn btn-ghost btn-sm${p === params ? " course-chip-active" : ""}`}
              onClick={() => setParams(p)}
            >
              {p}B
            </button>
          ))}
        </div>
      </div>

      <div className="course-demo-row" role="radiogroup" aria-label={t("course.vram.precision")}>
        <span className="course-demo-label">{t("course.vram.precision")}</span>
        {PRECISIONS.map((p) => (
          <button
            key={p.bits}
            type="button"
            role="radio"
            aria-checked={bits === p.bits}
            className={`btn btn-secondary btn-sm${bits === p.bits ? " course-chip-active" : ""}`}
            onClick={() => setBits(p.bits)}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      <div className="course-result" aria-live="polite">
        <strong>{t("course.vram.result", { gb })}</strong>
        <span>{t(`course.vram.tier.${tier}` as MessageKey)}</span>
      </div>
    </div>
  );
}
