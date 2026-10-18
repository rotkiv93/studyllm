import { useEffect, useRef, useState } from "react";
import { IconLoader } from "./icons";
import { insertQuizAttempt, listQuizAttempts, type ProviderRow, type QuizAttemptRow, type RagDocumentRow } from "../lib/db";
import { resolveEmbedder, retrieve, embedderErrorText, type LibraryChunk } from "../lib/rag";
import { errorText } from "../lib/localizedError";
import { useT } from "../lib/i18n";
import {
  QUIZ_USER_PROMPT,
  buildGradePrompt,
  buildGradeSystem,
  buildQuizSystem,
  numberPassages,
  parseGrade,
  parseQuiz,
  scoreQuiz,
  selectPassages,
  type QuizKind,
  type QuizPassage,
  type QuizQuestion,
  type QuizResult,
} from "../lib/quiz";

/**
 * Practice quiz tab of the Library. Generates questions from one document's passages, lets the student
 * answer with immediate feedback, shows a score, and lets them review only the ones they missed.
 * Short answers are graded by the model against the source passage and labelled as AI grading.
 * Model calls go through `onAsk` (App wires it to the failover router); attempts persist in SQLite.
 */

type Phase = "setup" | "generating" | "taking" | "done";

interface QuizPanelProps {
  documents: RagDocumentRow[];
  providers: ProviderRow[];
  /** All stored passages (already loaded by the Library), or null while loading. */
  chunks: LibraryChunk[] | null;
  initialDocumentId: string | null;
  /** One non-streaming model call: returns the full reply text. */
  onAsk: (system: string, user: string, signal: AbortSignal) => Promise<string>;
}

interface Attempt {
  documentId: string;
  documentName: string;
  passages: QuizPassage[];
  questions: QuizQuestion[];
}

export function QuizPanel({ documents, providers, chunks, initialDocumentId, onAsk }: QuizPanelProps) {
  const t = useT();
  const [documentId, setDocumentId] = useState(initialDocumentId ?? documents[0]?.id ?? "");
  const [count, setCount] = useState(5);
  const [kind, setKind] = useState<QuizKind>("mixed");
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<(QuizResult | undefined)[]>([]);
  const [history, setHistory] = useState<QuizAttemptRow[]>([]);
  const [reviewMissed, setReviewMissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== "setup") return;
    let cancelled = false;
    void listQuizAttempts()
      .then((rows) => !cancelled && setHistory(rows))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate() {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc || !chunks) return;
    setError(null);
    setPhase("generating");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let source = chunks.filter((c) => c.documentId === doc.id).sort((a, b) => a.seq - b.seq);
      if (topic.trim()) {
        // Focus on a topic: rank by meaning with the same retrieval chat uses, keep this document's hits.
        const resolved = await resolveEmbedder(providers);
        if ("error" in resolved) throw new Error(embedderErrorText(t, resolved));
        const hits = await retrieve(topic.trim(), resolved.embedder, Math.max(source.length, 8));
        const ranked = hits
          .map((h) => source.find((c) => c.seq === h.seq && c.documentName === h.documentName))
          .filter((c): c is LibraryChunk => !!c);
        if (ranked.length > 0) source = ranked;
      }
      const passages = numberPassages(selectPassages(source));
      const reply = await onAsk(buildQuizSystem(passages, count, kind), QUIZ_USER_PROMPT, ctrl.signal);
      const questions = parseQuiz(reply, passages.length);
      if (questions.length === 0) {
        setError(t("quiz.error.unreadable"));
        setPhase("setup");
        return;
      }
      setAttempt({ documentId: doc.id, documentName: doc.name, passages, questions });
      setResults([]);
      setStep(0);
      setReviewMissed(false);
      setPhase("taking");
    } catch (err) {
      if (!ctrl.signal.aborted) setError(errorText(t, err, t("quiz.error.generate")));
      setPhase("setup");
    }
  }

  function record(i: number, result: QuizResult) {
    setResults((prev) => {
      const next = [...prev];
      next[i] = result;
      return next;
    });
  }

  async function finish(final: (QuizResult | undefined)[]) {
    if (!attempt) return;
    const score = scoreQuiz(attempt.questions.map((_, i) => final[i]));
    setPhase("done");
    try {
      await insertQuizAttempt({
        id: crypto.randomUUID(),
        document_id: attempt.documentId,
        document_name: attempt.documentName,
        total: score.total,
        correct: score.correct,
        details_json: JSON.stringify({ passages: attempt.passages, questions: attempt.questions, results: final }),
        created_at: Date.now(),
      });
    } catch {
      /* history is a nicety; the score on screen is what matters */
    }
  }

  if (documents.length === 0) return <p className="settings-hint library-empty">{t("quiz.noDocuments")}</p>;

  if (phase === "setup" || phase === "generating") {
    const busy = phase === "generating";
    return (
      <div className="quiz">
        <p className="settings-hint">{t("quiz.hint")}</p>
        {error && <p className="error">{error}</p>}
        <label className="library-field">
          <span>{t("quiz.document")}</span>
          <select value={documentId} onChange={(e) => setDocumentId(e.currentTarget.value)} disabled={busy}>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="library-field">
          <span>{t("quiz.count")}</span>
          <select value={count} onChange={(e) => setCount(Number(e.currentTarget.value))} disabled={busy}>
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="library-field">
          <span>{t("quiz.kind")}</span>
          <select value={kind} onChange={(e) => setKind(e.currentTarget.value as QuizKind)} disabled={busy}>
            <option value="mixed">{t("quiz.kind.mixed")}</option>
            <option value="choice">{t("quiz.kind.choice")}</option>
            <option value="short">{t("quiz.kind.short")}</option>
          </select>
        </label>
        <label className="library-field">
          <span>{t("quiz.topic")}</span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.currentTarget.value)}
            placeholder={t("quiz.topicPlaceholder")}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm quiz-start"
          onClick={() => void generate()}
          disabled={busy || !documentId || !chunks}
        >
          {busy && <IconLoader size={14} />}
          {busy ? t("quiz.generating") : t("quiz.generate")}
        </button>

        {history.length > 0 && (
          <div className="quiz-history">
            <h3>{t("quiz.history")}</h3>
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <span className="quiz-history-name">{h.document_name}</span>
                  <span className="quiz-history-score">
                    {h.correct}/{h.total}
                  </span>
                  <span className="quiz-history-date">{new Date(h.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (!attempt) return null;
  const { questions, passages } = attempt;

  if (phase === "done") {
    const score = scoreQuiz(questions.map((_, i) => results[i]));
    const missed = questions.map((q, i) => ({ q, i })).filter(({ i }) => !results[i]?.correct);
    return (
      <div className="quiz">
        <div className="quiz-score">
          <span className="quiz-score-value">
            {score.correct}/{score.total}
          </span>
          <span>{t("quiz.score")}</span>
        </div>
        <div className="quiz-actions">
          {missed.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReviewMissed((v) => !v)}>
              {reviewMissed ? t("quiz.hideMissed") : t("quiz.reviewMissed", { count: missed.length })}
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase("setup")}>
            {t("quiz.newQuiz")}
          </button>
        </div>
        {missed.length === 0 && <p className="notice">{t("quiz.perfect")}</p>}
        {reviewMissed && (
          <ol className="quiz-review">
            {missed.map(({ q, i }) => (
              <li key={i}>
                <QuizQuestionView
                  q={q}
                  passage={passages[q.passage - 1]}
                  result={results[i]}
                  answered
                  onAnswer={() => undefined}
                  onGrade={() => Promise.resolve(null)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const q = questions[step];
  const result = results[step];
  const last = step === questions.length - 1;
  return (
    <div className="quiz">
      <p className="settings-hint">{t("quiz.progress", { n: step + 1, total: questions.length })}</p>
      <QuizQuestionView
        key={step}
        q={q}
        passage={passages[q.passage - 1]}
        result={result}
        answered={!!result}
        onAnswer={(r) => record(step, r)}
        onGrade={async (answer) => {
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          const reply = await onAsk(buildGradeSystem(), buildGradePrompt(q, passages[q.passage - 1], answer), ctrl.signal);
          return parseGrade(reply);
        }}
      />
      {result && (
        <button
          type="button"
          className="btn btn-primary btn-sm quiz-next"
          onClick={() => (last ? void finish(results) : setStep(step + 1))}
        >
          {last ? t("quiz.finish") : t("common.next")}
        </button>
      )}
    </div>
  );
}

function QuizQuestionView({
  q,
  passage,
  result,
  answered,
  onAnswer,
  onGrade,
}: {
  q: QuizQuestion;
  passage: QuizPassage | undefined;
  result: QuizResult | undefined;
  answered: boolean;
  onAnswer: (r: QuizResult) => void;
  onGrade: (answer: string) => Promise<{ correct: boolean; feedback: string } | null>;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState(false);

  async function submitShort() {
    setGrading(true);
    setGradeError(false);
    try {
      const verdict = await onGrade(text.trim());
      if (!verdict) setGradeError(true);
      else onAnswer({ response: text.trim(), correct: verdict.correct, feedback: verdict.feedback });
    } catch {
      setGradeError(true);
    } finally {
      setGrading(false);
    }
  }

  const picked = result && q.type === "choice" ? Number(result.response) : null;

  return (
    <div className="quiz-question">
      <p className="quiz-question-text">{q.question}</p>

      {q.type === "choice" ? (
        <ul className="quiz-options">
          {q.options?.map((opt, i) => {
            const state = !answered
              ? ""
              : i === q.answerIndex
                ? " quiz-option-correct"
                : i === picked
                  ? " quiz-option-wrong"
                  : "";
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`quiz-option${state}`}
                  disabled={answered}
                  onClick={() => onAnswer({ response: String(i), correct: i === q.answerIndex })}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !answered && (
          <>
            <textarea
              className="quiz-short-input"
              value={text}
              rows={3}
              onChange={(e) => setText(e.currentTarget.value)}
              placeholder={t("quiz.shortPlaceholder")}
              disabled={grading}
            />
            {gradeError && <p className="error">{t("quiz.error.grade")}</p>}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={grading || !text.trim()}
              onClick={() => void submitShort()}
            >
              {grading && <IconLoader size={14} />}
              {grading ? t("quiz.grading") : t("quiz.check")}
            </button>
          </>
        )
      )}

      {answered && (
        <div className={`quiz-feedback ${result?.correct ? "quiz-feedback-correct" : "quiz-feedback-wrong"}`}>
          <strong>{result?.correct ? t("quiz.correct") : t("quiz.incorrect")}</strong>
          {q.type === "short" && (
            <>
              <p className="quiz-ai-label">{t("quiz.aiGraded")}</p>
              {result?.response && <p>{t("quiz.yourAnswer", { answer: result.response })}</p>}
              {result?.feedback && <p>{result.feedback}</p>}
              <p>{t("quiz.referenceAnswer", { answer: q.answer ?? "" })}</p>
            </>
          )}
          {q.explanation && <p>{q.explanation}</p>}
          {passage && (
            <details className="quiz-source">
              <summary>{t("quiz.source", { doc: passage.documentName, seq: passage.seq })}</summary>
              <div className="library-chunk-text">{passage.text}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
