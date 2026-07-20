import type { ExploreTab } from "./ExplorePanel";

/**
 * "Lessons" — the landing tab of the Explore panel, and the thing that turns a pile of playgrounds
 * into something you can teach a class from. Each card is a bite-sized concept in plain language
 * with a "Try it" button that drops the student straight into the matching live playground.
 *
 * Order is a deliberate teaching arc: the model itself (tokens) → its main weakness (making things
 * up) → the two fixes students hear buzzwords for (RAG, tools) → putting it together (research).
 */

interface Lesson {
  n: number;
  title: string;
  term: string;
  body: string;
  cta: string;
  goTo: ExploreTab;
}

const LESSONS: Lesson[] = [
  {
    n: 1,
    title: "What the AI actually reads",
    term: "tokens",
    body:
      "An AI model never sees your letters — it first chops text into chunks called tokens. Seeing this explains why it counts letters badly and why it has size limits.",
    cta: "Split some text into tokens",
    goTo: "tokens",
  },
  {
    n: 2,
    title: "How you steer it with instructions",
    term: "system prompt",
    body:
      "Behind every chatbot is a hidden instruction that shapes its persona and rules. See the exact prompt the model receives, then change the instruction and watch its answer change.",
    cta: "Experiment with a system prompt",
    goTo: "system",
  },
  {
    n: 3,
    title: "Why it sometimes makes things up",
    term: "hallucination",
    body:
      "On its own, a model answers from fuzzy memory and can invent confident-sounding facts. Ask one question two ways and watch a made-up answer become a sourced one.",
    cta: "Compare a guess vs. a grounded answer",
    goTo: "grounding",
  },
  {
    n: 4,
    title: "How it finds the right passage",
    term: "RAG / retrieval",
    body:
      "“Chat with your documents” works by turning meaning into numbers and finding the closest passages to your question. Watch the real search rank every passage in your library.",
    cta: "Watch retrieval rank your documents",
    goTo: "retrieval",
  },
  {
    n: 5,
    title: "How it uses real tools",
    term: "MCP",
    body:
      "A tool is just a function the model is allowed to ask for — read a file, search the web. See a tool’s inputs, then watch the model choose one and fill in the blanks.",
    cta: "Watch the model use a tool",
    goTo: "tools",
  },
  {
    n: 6,
    title: "How it researches a big question",
    term: "agentic research",
    body:
      "Give a model tools and a goal and it can work in steps: break the question down, search, read sources, and write a cited answer. Watch a full run unfold live.",
    cta: "Run a live research trace",
    goTo: "research",
  },
];

export function LessonsPanel({ onGoTo }: { onGoTo: (tab: ExploreTab) => void }) {
  return (
    <div className="explore-body">
      <p className="settings-hint">
        Six short, hands-on lessons on how modern AI actually works — each opens a live playground
        you can poke at. Great to walk through top to bottom, on your own or in front of a class. No
        coding, no jargon left unexplained.
      </p>

      <ol className="lesson-grid">
        {LESSONS.map((lesson) => (
          <li key={lesson.n} className="lesson-card">
            <div className="lesson-card-head">
              <span className="lesson-card-num">{lesson.n}</span>
              <div className="lesson-card-titles">
                <span className="lesson-card-title">{lesson.title}</span>
                <span className="lesson-card-term">{lesson.term}</span>
              </div>
            </div>
            <p className="lesson-card-body">{lesson.body}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm lesson-card-cta"
              onClick={() => onGoTo(lesson.goTo)}
            >
              {lesson.cta} →
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
