import type { WorkerRequest, WorkerResponse } from './workerProtocol';
import type {
  BnBOptions,
  BnBProgress,
  BnBStats,
  CutOptimizerInput,
  CutOptimizerResult,
  ScoringParams,
} from './types';

export interface WorkerResult {
  result: CutOptimizerResult;
  stats: BnBStats | undefined;
}

interface PendingJob {
  resolve: (value: WorkerResult) => void;
  reject: (reason: Error) => void;
  onProgress: ((progress: BnBProgress) => void) | undefined;
}

export class CutOptimizerWorker {
  private worker: Worker;
  private pending = new Map<string, PendingJob>();
  private idCounter = 0;

  constructor() {
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const w = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    );
    w.onmessage = this.handleMessage.bind(this);
    return w;
  }

  runFfd(input: CutOptimizerInput): Promise<CutOptimizerResult> {
    const id = this.nextId();
    return this.send(
      { type: 'run-ffd', id, input },
      undefined,
    ).then((r) => r.result);
  }

  runBnB(
    input: CutOptimizerInput,
    options: BnBOptions,
    onProgress: ((progress: BnBProgress) => void) | undefined,
  ): Promise<WorkerResult> {
    const id = this.nextId();
    return this.send(
      { type: 'run-bnb', id, input, options },
      onProgress,
    );
  }

  runIlp(
    input: CutOptimizerInput,
    scoringParams: ScoringParams,
  ): Promise<CutOptimizerResult> {
    const id = this.nextId();
    return this.send(
      { type: 'run-ilp', id, input, scoringParams },
      undefined,
    ).then((r) => r.result);
  }

  cancel(): void {
    // Worker is blocked in synchronous B&B — terminate and recreate
    this.worker.terminate();
    for (const { reject } of this.pending.values()) {
      reject(new Error('Cancelled'));
    }
    this.pending.clear();
    this.worker = this.createWorker();
  }

  dispose(): void {
    this.worker.terminate();
    for (const { reject } of this.pending.values()) {
      reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }

  private nextId(): string {
    return String(++this.idCounter);
  }

  private send(
    msg: WorkerRequest,
    onProgress: ((progress: BnBProgress) => void) | undefined,
  ): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      if (msg.type === 'cancel') return;
      this.pending.set(msg.id, { resolve, reject, onProgress });
      this.worker.postMessage(msg);
    });
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;
    const entry = this.pending.get(msg.id);
    if (!entry) return;

    switch (msg.type) {
      case 'result':
        this.pending.delete(msg.id);
        entry.resolve({ result: msg.result, stats: msg.stats });
        break;
      case 'progress':
        entry.onProgress?.(msg.progress);
        break;
      case 'error':
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.error));
        break;
      case 'cancelled':
        this.pending.delete(msg.id);
        entry.reject(new Error('Cancelled'));
        break;
    }
  }
}
