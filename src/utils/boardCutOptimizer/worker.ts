/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from './workerProtocol';
import { optimizeCutsIlp } from './ilp';

function respond(msg: WorkerResponse): void {
  self.postMessage(msg);
}

// Lazy-loaded HiGHS WASM singleton
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highsPromise: Promise<any> | null = null;

function getHighs() {
  if (!highsPromise) {
    highsPromise = (async () => {
      const mod = await import('highs');
      const loader = mod.default;
      return loader({
        locateFile: () => '/highs.wasm',
      });
    })();
  }
  return highsPromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') return;

  try {
    if (msg.type === 'run-ilp') {
      const highs = await getHighs();
      const result = optimizeCutsIlp(
        msg.input,
        msg.scoringParams,
        highs,
      );
      respond({ type: 'result', id: msg.id, result });
    }
  } catch (e) {
    respond({
      type: 'error',
      id: msg.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
