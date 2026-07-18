import { useState } from "react";
import { IconSearch, IconBook, IconChevronDown } from "./icons";

/**
 * The "learn what these do" surface on the empty chat screen. Two cards — Deep Research and Chat
 * with your documents (RAG) — each explaining, in plain student-facing language, *what* the feature
 * does, *why* it helps, and *how it works* (an expandable step pipeline). A "Try it" button starts
 * the student down the right path. The pipeline labels deliberately match the steps the student then
 * sees happen live in the transcript (search → read → synthesize; retrieve → grounded answer), so
 * the card teaches the run.
 */

interface FeatureExplainerProps {
  onTryDeepResearch: () => void;
  onTryLibrary: () => void;
  /** Document count in the library — tunes the RAG card's CTA between "Add documents" and "Use it". */
  libraryDocCount: number;
}

interface FeatureCard {
  id: string;
  icon: typeof IconSearch;
  title: string;
  what: string;
  why: string;
  /** Ordered pipeline steps: [label, detail]. */
  pipeline: [string, string][];
}

const CARDS: Omit<FeatureCard, "icon">[] = [
  {
    id: "deep-research",
    title: "Deep Research",
    what: "Ask a big question and the assistant investigates it across the web over several steps — then writes a report that cites its sources.",
    why: "Instead of one guessed answer, you get a sourced, up-to-date briefing you can trust and check — great for essays, current events, and fact-checking.",
    pipeline: [
      ["Your question", "e.g. “How do the EU and US regulate AI?”"],
      ["Sub-questions", "The assistant breaks it into focused parts."],
      ["Search the web", "It searches for each part using research tools."],
      ["Read sources", "It opens and reads the most relevant pages."],
      ["Synthesize", "It cross-checks and combines what it found."],
      ["Cited report", "You get an answer with a Sources list of links."],
    ],
  },
  {
    id: "rag",
    title: "Chat with your documents",
    what: "Add your own notes, PDFs, and papers to a library. When you ask a question, the assistant finds the most relevant passages and answers from them.",
    why: "Answers are grounded in *your* materials and show which passages they came from — so you can study from your syllabus, not the whole internet.",
    pipeline: [
      ["Add a document", "Upload lecture notes, a PDF, or a paper."],
      ["Chunk", "It's split into small, searchable passages."],
      ["Embed", "Each passage becomes a vector capturing its meaning."],
      ["Retrieve", "Your question finds the closest-matching passages."],
      ["Grounded answer", "The assistant answers using those passages, and cites them."],
    ],
  },
];

const ICONS: Record<string, typeof IconSearch> = {
  "deep-research": IconSearch,
  rag: IconBook,
};

function Card({
  card,
  onTry,
  ctaLabel,
}: {
  card: Omit<FeatureCard, "icon">;
  onTry: () => void;
  ctaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[card.id];
  return (
    <div className="feature-card">
      <div className="feature-card-head">
        <span className="feature-card-icon">
          <Icon size={18} />
        </span>
        <h3 className="feature-card-title">{card.title}</h3>
      </div>
      <p className="feature-card-what">{card.what}</p>
      <p className="feature-card-why">{card.why}</p>

      <button
        type="button"
        className="feature-card-how-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconChevronDown size={13} className={open ? "feature-chevron-open" : undefined} />
        How it works
      </button>
      {open && (
        <ol className="feature-pipeline">
          {card.pipeline.map(([label, detail], i) => (
            <li key={i} className="feature-pipeline-step">
              <span className="feature-pipeline-num">{i + 1}</span>
              <span className="feature-pipeline-body">
                <span className="feature-pipeline-label">{label}</span>
                <span className="feature-pipeline-detail">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="btn btn-primary btn-sm feature-card-cta" onClick={onTry}>
        {ctaLabel}
      </button>
    </div>
  );
}

export function FeatureExplainer({ onTryDeepResearch, onTryLibrary, libraryDocCount }: FeatureExplainerProps) {
  return (
    <div className="feature-explainer">
      <p className="feature-explainer-title">Two ways to research smarter</p>
      <div className="feature-cards">
        <Card card={CARDS[0]} onTry={onTryDeepResearch} ctaLabel="Try Deep Research" />
        <Card
          card={CARDS[1]}
          onTry={onTryLibrary}
          ctaLabel={libraryDocCount > 0 ? "Open your library" : "Add your documents"}
        />
      </div>
    </div>
  );
}
