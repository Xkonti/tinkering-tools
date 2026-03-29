import type { WorkerRequest, WorkerResponse } from './workerProtocol';
import type {
  CutOptimizerInput,
  CutOptimizerResult,
  ScoringParams,
} from './types';

interface PendingJob {
  resolve: (value: CutOptimizerResult) => void;
  reject: (reason: Error) => void;
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

  run(
    input: CutOptimizerInput,
    scoringParams: ScoringParams,
  ): Promise<CutOptimizerResult> {
    const id = this.nextId();
    const msg: WorkerRequest = { type: 'run-ilp', id, input, scoringParams };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(msg);
    });
  }

  cancel(): void {
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

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;
    const entry = this.pending.get(msg.id);
    if (!entry) return;

    switch (msg.type) {
      case 'result':
        this.pending.delete(msg.id);
        entry.resolve(msg.result);
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
