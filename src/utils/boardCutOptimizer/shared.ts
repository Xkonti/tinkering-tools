import type {
  DemandItem,
  OpenBoard,
  RequiredPiece,
  StockBoard,
  UnfulfilledPiece,
} from './types';

// ============================================================
// Demand expansion (shared by FFD and B&B)
// ============================================================

export function expandDemand(
  requiredPieces: RequiredPiece[],
  maxBoardLength: number,
  typeName: string,
): { demandItems: DemandItem[]; unfulfilled: UnfulfilledPiece[] } {
  const demandItems: DemandItem[] = [];
  const unfulfilled: UnfulfilledPiece[] = [];

  for (const rp of requiredPieces) {
    if (rp.length > maxBoardLength + 1e-9) {
      const uf: UnfulfilledPiece = {
        stockTypeName: typeName,
        length: rp.length,
        quantity: rp.quantity,
        reason: 'No board long enough for this piece',
      };
      if (rp.name) uf.name = rp.name;
      unfulfilled.push(uf);
      continue;
    }
    for (let i = 0; i < rp.quantity; i++) {
      const item: DemandItem = { length: rp.length };
      if (rp.name) item.name = rp.name;
      demandItems.push(item);
    }
  }

  // Sort longest first, then by name for symmetry breaking
  demandItems.sort(
    (a, b) =>
      b.length - a.length ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );
  return { demandItems, unfulfilled };
}

// ============================================================
// FFD placement (shared by FFD and B&B warm start)
// ============================================================

function placeOnBoard(
  board: OpenBoard,
  item: DemandItem,
  kerf: number,
): void {
  const betweenKerf = board.pieces.length > 0 ? kerf : 0;
  board.pieces.push(item);
  board.usedLength += betweenKerf + item.length;
  board.remainingCapacity = board.stockBoard.length - board.usedLength;
}

export function ffdPlace(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): { openBoards: OpenBoard[]; unfulfilled: DemandItem[] } {
  const openBoards: OpenBoard[] = [];
  const unopened = [...boards].sort((a, b) => a.length - b.length);
  const unfulfilled: DemandItem[] = [];

  for (const item of demandItems) {
    let bestIdx = -1;
    let bestRemaining = Infinity;

    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const spaceNeeded =
        item.length + (board.pieces.length > 0 ? kerf : 0);
      if (spaceNeeded <= board.remainingCapacity + 1e-9) {
        const remainingAfter = board.remainingCapacity - spaceNeeded;
        if (remainingAfter < bestRemaining) {
          bestRemaining = remainingAfter;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      placeOnBoard(openBoards[bestIdx]!, item, kerf);
      continue;
    }

    let opened = false;
    for (let i = 0; i < unopened.length; i++) {
      const sb = unopened[i]!;
      if (item.length <= sb.length + 1e-9) {
        const newBoard: OpenBoard = {
          stockBoard: sb,
          pieces: [],
          usedLength: 0,
          remainingCapacity: sb.length,
        };
        placeOnBoard(newBoard, item, kerf);
        openBoards.push(newBoard);
        unopened.splice(i, 1);
        opened = true;
        break;
      }
    }

    if (!opened) {
      unfulfilled.push(item);
    }
  }

  return { openBoards, unfulfilled };
}

// ============================================================
// Seeded PRNG (deterministic shuffles for multi-start FFD)
// ============================================================

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeSeed(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): number {
  let hash = 0;
  for (const item of demandItems) {
    hash = ((hash * 31) + Math.round(item.length * 1e6)) | 0;
    if (item.name) {
      for (let i = 0; i < item.name.length; i++) {
        hash = ((hash * 31) + item.name.charCodeAt(i)) | 0;
      }
    }
  }
  for (const b of boards) {
    hash = ((hash * 31) + Math.round(b.length * 1e6)) | 0;
  }
  hash = ((hash * 31) + Math.round(kerf * 1e6)) | 0;
  return hash;
}
