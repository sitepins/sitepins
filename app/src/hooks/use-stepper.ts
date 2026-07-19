"use client";

import { useCallback, useEffect, useReducer } from "react";

export type StepStatus = "pending" | "loading" | "completed" | "error";

export interface StepRunResult {
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface StepConfig {
  id: string;
  title: string;
  status?: StepStatus;
  run: (ctx: any) => Promise<StepRunResult>;
}

export interface StepState extends StepConfig {
  status: StepStatus;
  error?: string;
  meta?: Record<string, unknown>;
}

interface StepperState {
  steps: StepState[];
  current: number;
  started: boolean;
  runId: number; // increment to force rerun
}

type Action =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "NEXT" }
  | {
      type: "SET_STATUS";
      id: string;
      status: StepStatus;
      error?: string;
      meta?: Record<string, unknown>;
    }
  | { type: "INCREMENT_RUNID" };

function stepReducer(state: StepperState, action: Action): StepperState {
  switch (action.type) {
    case "RESET":
      return {
        ...state,
        steps: state.steps.map((s) => ({
          ...s,
          status: "pending",
          error: "",
          meta: undefined,
        })),
        current: -1,
        started: false,
        runId: 0,
      };
    case "START":
      return {
        ...state,
        started: true,
        current: state.current < 0 ? 0 : state.current,
      };
    case "NEXT":
      return { ...state, current: state.current + 1 };
    case "SET_STATUS":
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.id
            ? {
                ...s,
                status: action.status,
                error: action.error,
                meta: action.meta,
              }
            : s,
        ),
      };
    case "INCREMENT_RUNID":
      return { ...state, runId: state.runId + 1 };
    default:
      return state;
  }
}

export function useStepper(stepsConfig: StepConfig[], ctx: any) {
  const [state, dispatch] = useReducer(stepReducer, {
    steps: stepsConfig.map((s) => ({
      ...s,
      status: "pending" as StepStatus,
      error: undefined,
      meta: undefined,
    })),
    current: -1,
    started: false,
    runId: 0,
  });

  const startSetup = useCallback(() => {
    dispatch({ type: "RESET" });
    dispatch({ type: "START" });
  }, []);

  const resetSetup = useCallback(() => dispatch({ type: "RESET" }), []);

  const retryStep = useCallback(
    (stepId?: string) => {
      const id = stepId ?? state.steps[state.current]?.id;
      if (!id) return;
      dispatch({
        type: "SET_STATUS",
        id,
        status: "pending",
        error: "",
        meta: undefined,
      });
      dispatch({ type: "INCREMENT_RUNID" }); // force rerun effect
      dispatch({ type: "START" }); // restart current step
    },
    [state],
  );

  const allCompleted = state.steps.every((s) => s.status === "completed");
  const hasErrors = state.steps.some((s) => s.status === "error");
  const isRunning = state.started && !allCompleted;

  const ctxStr = JSON.stringify(ctx);

  // Run step when current changes
  useEffect(() => {
    if (!isRunning || state.current < 0) return;
    const step = state.steps[state.current];
    if (!step || step.status === "completed" || step.status === "loading")
      return;

    (async () => {
      dispatch({
        type: "SET_STATUS",
        id: step.id,
        status: "loading",
        meta: undefined,
      });
      const result = await step.run(ctx);
      if (result.success) {
        dispatch({
          type: "SET_STATUS",
          id: step.id,
          status: "completed",
          meta: result.meta,
        });
        dispatch({ type: "NEXT" });
      } else {
        dispatch({
          type: "SET_STATUS",
          id: step.id,
          status: "error",
          error: result.error,
          meta: result.meta,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current, isRunning, JSON.stringify(ctx), state.runId]);

  return {
    steps: state.steps,
    startSetup,
    resetSetup,
    retryStep,
    allCompleted,
    hasErrors,
    isRunning,
  };
}
