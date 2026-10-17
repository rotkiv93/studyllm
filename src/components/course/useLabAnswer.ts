import { useCallback, useEffect, useRef, useState } from "react";
import type { LabRequest, RunLab } from "../../lib/course/labs";

export interface LabAnswerState {
  text: string | null;
  /** "Provider · model" once the router reports who answered. */
  who: string;
  busy: boolean;
  error: string | null;
}

/**
 * One streamed model call for the small interactive tools (prompt builder, request inspector) that
 * need "send this and show me the reply" but not a whole conversation. `send` resolves `true` when a
 * non-empty answer arrived. The call is aborted if the component unmounts.
 */
export function useLabAnswer(run: RunLab) {
  const [state, setState] = useState<LabAnswerState>({ text: null, who: "", busy: false, error: null });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (request: LabRequest): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ text: "", who: "", busy: true, error: null });
      let text = "";
      let who = "";
      let error: string | null = null;
      try {
        await run(
          request,
          (e) => {
            if (e.type === "chunk") {
              text += e.text;
              setState((s) => ({ ...s, text }));
            } else if (e.type === "done") {
              who = `${e.providerLabel} · ${e.model}`;
              setState((s) => ({ ...s, who }));
            } else if (e.type === "error") error = e.message;
          },
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) error = err instanceof Error ? err.message : String(err);
      }
      abortRef.current = null;
      setState({ text, who, busy: false, error });
      return !error && text.trim() !== "";
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { ...state, send, stop };
}
