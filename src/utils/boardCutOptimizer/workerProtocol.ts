import type {
  CutOptimizerInput,
  CutOptimizerResult,
  ScoringParams,
} from './types';

// --- Messages from main thread to worker ---

export type WorkerRequest =
  | {
      type: 'run-ilp';
      id: string;
      input: CutOptimizerInput;
      scoringParams: ScoringParams;
    }
  | { type: 'cancel'; id: string };

// --- Messages from worker to main thread ---

export type WorkerResponse =
  | {
      type: 'result';
      id: string;
      result: CutOptimizerResult;
    }
  | { type: 'error'; id: string; error: string }
  | { type: 'cancelled'; id: string };
