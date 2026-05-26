import type { Kota0Plan } from "../../shared/kota0Plan";
import type { MockScriptedTurn } from "./mockAgentModel";

export type Kota0EvalFixtureExpectations = {
  /** Agent must call `finish` (sane apply terminates this way). */
  finishCalled: boolean;
  /** App.vue should be persisted (or not). */
  sourceChanged: boolean;
  backendChanged: boolean;
  envChanged: boolean;
  /** Agent must terminate within this many recorded steps. */
  maxSteps: number;
  /** No file outside `plan.changes` should be mutated. */
  onlyTouchesPlannedFiles: boolean;
};

export type Kota0EvalFixture = {
  /** Stable id used in CLI output. */
  name: string;
  /** One-line human description. */
  description: string;
  /** The accepted plan envelope the agent loop should apply. */
  plan: Kota0Plan;
  /** Scribe HEAD the agent starts from. */
  initialHead: { source: string; backendSource: string; bundleEnv: string };
  /** One stream result per agent step. */
  scriptedTurns: MockScriptedTurn[];
  /** Pass/fail criteria checked by scorers. */
  expect: Kota0EvalFixtureExpectations;
};
