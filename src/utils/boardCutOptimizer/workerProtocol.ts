import type {
  BnBOptions,
  BnBProgress,
  BnBStats,
  CutOptimizerInput,
  CutOptimizerResult,
  ScoringParams,
} from './types';

// --- Messages from main thread to worker ---

export type WorkerRequest =
  | { type: 'run-ffd'; id: string; input: CutOptimizerInput }
  | {
      type: 'run-bnb';
      id: string;
      input: CutOptimizerInput;
      options: BnBOptions;
    }
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
      stats?: BnBStats;
    }
  | { type: 'progress'; id: string; progress: BnBProgress }
  | { type: 'error'; id: string; error: string }
  | { type: 'cancelled'; id: string };
