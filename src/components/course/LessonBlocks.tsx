import { useEffect, useState, type ReactNode } from "react";
import { IconChevronDown } from "../icons";
import { COURSE_MODULES, groupOf, type CourseModule, type EmbedId } from "../../lib/course/modules";
import { LESSONS, type LessonBlock } from "../../lib/course/lessons";
import { useI18n, useT, type MessageKey } from "../../lib/i18n";

/**
 * Renders a module's teaching content as visual blocks instead of Markdown: a hero banner with the
 * module's goals, then cards, timelines, steppers, side-by-side comparisons, prompt examples and
 * callouts, annotated screenshots of the app, and the interactive tasks and tools placed right in the
 * flow. The structure comes from `lib/course/lessons.ts`; every string is a locale key. Tasks and tools
 * are rendered by the caller (they need the app's state), through `renderTask` / `renderEmbed`.
 */

const key = (k: string) => k as MessageKey;

export function LessonHero({
  mod,
  taskCount,
  complete,
}: {
  mod: CourseModule;
  taskCount: number;
  /** Every required task is done — shows a "module complete" badge on the banner. */
  complete: boolean;
}) {
  const t = useT();
  const lesson = LESSONS[mod.n];
  if (!lesson) return null;
  const { hero } = lesson;

  return (
    <header className="lesson-hero">
      <div className="lesson-hero-icon" aria-hidden="true">
        {hero.icon}
      </div>
      <div className="lesson-hero-main">
        <span className="lesson-hero-kicker">
          {groupOf(mod.n) && <>{groupOf(mod.n)!.icon} {t(key(`course.group.${groupOf(mod.n)!.id}`))} · </>}
          {t("course.moduleOf", { n: mod.n, total: COURSE_MODULES.length })}
        </span>
        <h2 className="lesson-hero-title">
          {t(key(`course.m${mod.n}.title`))}
          {complete && <span className="course-module-badge">{t("course.moduleComplete")}</span>}
        </h2>
        <span className="lesson-hero-term">{t(key(`course.m${mod.n}.term`))}</span>
        <p className="lesson-hero-summary">{t(key(`course.m${mod.n}.summary`))}</p>
        <div className="lesson-hero-meta">
          <span className="lesson-chip">⏱ {t("course.hero.minutes", { n: hero.minutes })}</span>
          <span className="lesson-chip">🎯 {t("course.hero.tasks", { n: taskCount })}</span>
        </div>
      </div>
      <div className="lesson-goals">
        <span className="lesson-goals-title">{t("course.hero.goalsTitle")}</span>
        <ul>
          {Array.from({ length: hero.goals }, (_, i) => (
            <li key={i}>
              <span className="lesson-goal-tick" aria-hidden="true">
                ✓
              </span>
              {t(key(`course.m${mod.n}.hero.g${i + 1}`))}
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

interface BlockRenderers {
  renderTask: (taskId: string) => ReactNode;
  renderEmbed: (embed: EmbedId) => ReactNode;
  /** Section keys (`block:<n>.<id>`) the student has folded away. */
  folded: ReadonlySet<string>;
  onToggleFold: (key: string) => void;
}

export function LessonBlocks({ n, renderTask, renderEmbed, folded, onToggleFold }: { n: number } & BlockRenderers) {
  const lesson = LESSONS[n];
  if (!lesson) return null;
  return (
    <div className="lesson-blocks">
      {lesson.blocks.map((block, i) => (
        <Block
          key={block.kind === "task" ? block.task : `${block.id}-${i}`}
          n={n}
          block={block}
          renderTask={renderTask}
          renderEmbed={renderEmbed}
          folded={folded}
          onToggleFold={onToggleFold}
        />
      ))}
    </div>
  );
}

/** The OS colour scheme, kept live — the app follows it, so the screenshots should too. */
function useColorScheme(): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}

/**
 * A screenshot of the app in a window-style frame. Click to enlarge; Esc or a click closes it. If the
 * image can't load (not captured for this language yet) the frame simply isn't drawn.
 */
function Shot({ name, alt }: { name: string; alt: string }) {
  const { lang, t } = useI18n();
  const theme = useColorScheme();
  const src = `${import.meta.env.BASE_URL}course/${lang}/${theme}/${name}.png`;
  return <ShotImage key={src} src={src} alt={alt} t={t} />;
}

function ShotImage({ src, alt, t }: { src: string; alt: string; t: ReturnType<typeof useI18n>["t"] }) {
  const [zoom, setZoom] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  if (broken) return null;
  return (
    <>
      <button type="button" className="lesson-shot-frame" onClick={() => setZoom(true)} title={t("course.shot.enlarge")}>
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
        <span className="lesson-shot-zoom" aria-hidden="true">
          🔍
        </span>
      </button>
      {zoom && (
        <div className="lesson-lightbox" role="dialog" aria-label={alt} onClick={() => setZoom(false)}>
          <img src={src} alt={alt} />
          <button type="button" className="btn btn-secondary btn-sm lesson-lightbox-close">
            {t("course.shot.close")}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Tiles you click for more. One tile is open at a time and shows a longer explanation, an example you
 * can copy, and a link to the real thing — so a long list of tools stays scannable until you ask.
 */
function Explore({
  icons,
  examples,
  links,
  text,
}: {
  icons: string[];
  examples: boolean;
  links: (string | undefined)[];
  text: (suffix: string) => string;
}) {
  const t = useT();
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const open = sel === null ? null : sel + 1;

  async function copy(example: string) {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the example is still selectable */
    }
  }

  return (
    <div className="explore">
      <ul className="explore-grid">
        {icons.map((icon, i) => (
          <li key={i}>
            <button
              type="button"
              className={`explore-tile${sel === i ? " explore-tile-on" : ""}`}
              aria-pressed={sel === i}
              onClick={() => setSel(sel === i ? null : i)}
            >
              <span className="explore-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="explore-name">{text(`i${i + 1}.t`)}</span>
              <span className="explore-short">{text(`i${i + 1}.d`)}</span>
            </button>
          </li>
        ))}
      </ul>

      {open === null ? (
        <p className="explore-hint">{t("course.explore.hint")}</p>
      ) : (
        <div className="explore-detail" role="region" aria-live="polite" key={open}>
          <div className="explore-detail-head">
            <span className="explore-icon" aria-hidden="true">
              {icons[open - 1]}
            </span>
            <strong>{text(`i${open}.t`)}</strong>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setSel(null)}
              aria-label={t("course.explore.close")}
              title={t("course.explore.close")}
            >
              ✕
            </button>
          </div>
          <p>{text(`i${open}.more`)}</p>
          {examples && (
            <div className="explore-example">
              <span className="explore-example-label">{t("course.explore.example")}</span>
              <blockquote>{text(`i${open}.ex`)}</blockquote>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(text(`i${open}.ex`))}>
                {copied ? t("course.explore.copied") : t("course.explore.copy")}
              </button>
            </div>
          )}
          {links[open - 1] && (
            <a className="btn btn-secondary btn-sm explore-link" href={links[open - 1]} target="_blank" rel="noreferrer">
              {t("course.explore.open", { name: text(`i${open}.t`) })} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ n, block, renderTask, renderEmbed, folded, onToggleFold }: { n: number; block: LessonBlock } & BlockRenderers) {
  const t = useT();
  if (block.kind === "task") return <>{renderTask(block.task)}</>;
  const p = `course.m${n}.b.${block.id}`;
  const text = (suffix: string) => t(key(`${p}.${suffix}`));
  const foldKey = `block:${n}.${block.id}`;
  const isFolded = folded.has(foldKey);

  /** A section whose title is a button: click to fold it away once you've read it. */
  const sec = (lead: boolean | undefined, content: ReactNode): ReactNode => (
    <section className={`lesson-block${isFolded ? " lesson-block-folded" : ""}`}>
      <div className="lesson-block-head">
        <button
          type="button"
          className="lesson-block-fold"
          onClick={() => onToggleFold(foldKey)}
          aria-expanded={!isFolded}
          title={isFolded ? t("course.task.expand") : t("course.task.collapse")}
        >
          <h3 className="lesson-block-title">{text("title")}</h3>
          <IconChevronDown size={15} />
        </button>
        {!isFolded && lead && <p className="lesson-block-lead">{text("lead")}</p>}
      </div>
      {!isFolded && content}
    </section>
  );

  switch (block.kind) {
    case "cards":
      return sec(
        block.lead,
        <>
          <ul className={`lesson-cards lesson-cards-${block.icons.length}`}>
            {block.icons.map((icon, i) => (
              <li key={i} className="lesson-card-tile">
                <span className="lesson-card-icon" aria-hidden="true">
                  {icon}
                </span>
                <strong className="lesson-card-name">{text(`i${i + 1}.t`)}</strong>
                <span className="lesson-card-text">{text(`i${i + 1}.d`)}</span>
              </li>
            ))}
          </ul>
        </>,
      );

    case "explore":
      return sec(
        block.lead,
        <Explore icons={block.icons} examples={!!block.examples} links={block.links ?? []} text={text} />,
      );

    case "steps":
      return sec(
        block.lead,
        <>
          <ol className="lesson-steps">
            {Array.from({ length: block.count }, (_, i) => (
              <li key={i} className="lesson-step">
                <span className="lesson-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="lesson-step-body">
                  <strong>{text(`i${i + 1}.t`)}</strong>
                  <span>{text(`i${i + 1}.d`)}</span>
                </div>
              </li>
            ))}
          </ol>
        </>,
      );

    case "timeline":
      return sec(
        block.lead,
        <>
          <ol className="lesson-timeline">
            {Array.from({ length: block.count }, (_, i) => (
              <li key={i} className="lesson-timeline-item">
                <span className="lesson-timeline-when">{text(`i${i + 1}.t`)}</span>
                <span className="lesson-timeline-what">{text(`i${i + 1}.d`)}</span>
              </li>
            ))}
          </ol>
        </>,
      );

    case "compare":
      return sec(
        false,
        <>
          <div className="lesson-compare">
            {(["a", "b"] as const).map((side, idx) => (
              <div key={side} className={`lesson-compare-side lesson-compare-${side}`}>
                <div className="lesson-compare-head">
                  <span aria-hidden="true">{block.icons[idx]}</span>
                  <strong>{text(`${side}.t`)}</strong>
                </div>
                <ul>
                  {Array.from({ length: block.points }, (_, j) => (
                    <li key={j}>{text(`${side}.p${j + 1}`)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>,
      );

    case "shots":
      return sec(
        block.lead,
        <>
          <ol className="lesson-shots">
            {block.shots.map((name, i) => (
              <li key={name} className="lesson-shot">
                <span className="lesson-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="lesson-shot-body">
                  <strong>{text(`i${i + 1}.t`)}</strong>
                  <span>{text(`i${i + 1}.d`)}</span>
                  <Shot name={name} alt={text(`i${i + 1}.t`)} />
                </div>
              </li>
            ))}
          </ol>
        </>,
      );

    case "embed":
      return sec(
        block.lead,
        <>
          <div className="course-playground">{renderEmbed(block.embed)}</div>
        </>,
      );

    case "callout":
      return (
        <aside className={`lesson-callout lesson-callout-${block.tone}`} role="note">
          <span className="lesson-callout-icon" aria-hidden="true">
            {block.icon}
          </span>
          <div>
            <strong>{text("title")}</strong>
            <p>{text("body")}</p>
          </div>
        </aside>
      );

    case "example":
      return sec(
        false,
        <>
          <div className="lesson-example">
            {(["a", "b"] as const).map((side) => (
              <figure
                key={side}
                className={`lesson-example-card lesson-example-${block.variant === "before-after" ? (side === "a" ? "weak" : "strong") : "pair"}`}
              >
                <figcaption>{text(`${side}.label`)}</figcaption>
                <blockquote>{text(`${side}.text`)}</blockquote>
              </figure>
            ))}
          </div>
        </>,
      );
  }
}
