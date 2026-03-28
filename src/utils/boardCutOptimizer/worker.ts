/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from './workerProtocol';
import { optimizeCuts } from './ffd';
import { optimizeCutsBnB } from './bnb';

function respond(msg: WorkerResponse): void {
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') return; // Cancel is handled by worker.terminate()

  try {
    if (msg.type === 'run-ffd') {
      const result = optimizeCuts(msg.input);
      respond({ type: 'result', id: msg.id, result });
    } else if (msg.type === 'run-bnb') {
      const { result, stats } = optimizeCutsBnB(
        msg.input,
        msg.options,
        (progress) => {
          respond({ type: 'progress', id: msg.id, progress });
        },
      );
      respond({ type: 'result', id: msg.id, result, stats });
    }
  } catch (e) {
    respond({
      type: 'error',
      id: msg.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
