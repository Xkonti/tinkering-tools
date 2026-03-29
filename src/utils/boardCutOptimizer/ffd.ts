import type {
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  DemandItem,
  OpenBoard,
  RequiredPiece,
  StockBoard,
  UnfulfilledPiece,
} from './types';
import {
  aggregateUnfulfilled,
  buildCutPatterns,
  computeSummary,
} from './buildOutput';

// ============================================================
// Phase 1: Expand demand & validate
// ============================================================

function expandDemand(
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

  // FFD: sort longest first
  demandItems.sort(
    (a, b) =>
      b.length - a.length ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );
  return { demandItems, unfulfilled };
}

// ============================================================
// Phase 2: First Fit Decreasing placement
// ============================================================

function placeOnBoard(
  board: OpenBoard,
  item: DemandItem,
  kerf: number,
): void {
  // Between-piece kerf (cut to separate from previous piece)
  const betweenKerf = board.pieces.length > 0 ? kerf : 0;
  board.pieces.push(item);
  board.usedLength += betweenKerf + item.length;
  board.remainingCapacity = board.stockBoard.length - board.usedLength;
}

function ffdPlace(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): { openBoards: OpenBoard[]; unfulfilled: DemandItem[] } {
  const openBoards: OpenBoard[] = [];
  // Sort available boards ascending by length (shortest first)
  const unopened = [...boards].sort((a, b) => a.length - b.length);
  const unfulfilled: DemandItem[] = [];

  for (const item of demandItems) {
    // 1. Try open boards — best fit (least remaining after placement)
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

    // 2. Open the shortest unopened board that fits
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
// Per-type solver
// ============================================================

function solveForType(
  typeName: string,
  boards: StockBoard[],
  requiredPieces: RequiredPiece[],
  kerf: number,
  minUsefulRemnant: number,
): { patterns: CutPattern[]; unfulfilled: UnfulfilledPiece[] } {
  if (requiredPieces.length === 0) {
    return { patterns: [], unfulfilled: [] };
  }

  const maxBoardLength = boards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );

  // Phase 1: Expand demand items and filter oversized pieces
  const { demandItems, unfulfilled: earlyUnfulfilled } = expandDemand(
    requiredPieces,
    maxBoardLength,
    typeName,
  );

  if (demandItems.length === 0) {
    return { patterns: [], unfulfilled: earlyUnfulfilled };
  }

  // Phase 2: FFD placement
  const { openBoards, unfulfilled: ffdUnfulfilled } = ffdPlace(
    demandItems,
    boards,
    kerf,
  );

  // Phase 3: Build output
  const patterns = buildCutPatterns(openBoards, kerf, minUsefulRemnant);
  const unfulfilled = [
    ...earlyUnfulfilled,
    ...aggregateUnfulfilled(ffdUnfulfilled, typeName),
  ];

  return { patterns, unfulfilled };
}

// ============================================================
// Main entry point
// ============================================================

export function optimizeCuts(input: CutOptimizerInput): CutOptimizerResult {
  const { kerf, minUsefulRemnant } = input;

  // Group required pieces and boards by stock type
  const piecesByType = new Map<string, RequiredPiece[]>();
  for (const rp of input.requiredPieces) {
    const list = piecesByType.get(rp.stockTypeName) ?? [];
    list.push(rp);
    piecesByType.set(rp.stockTypeName, list);
  }

  const boardsByType = new Map<string, StockBoard[]>();
  for (const st of input.stockTypes) {
    boardsByType.set(st.name, [...st.boards]);
  }

  // Solve each stock type independently
  const patternsByType: Record<string, CutPattern[]> = {};
  const allUnfulfilled: UnfulfilledPiece[] = [];

  for (const [typeName, pieces] of piecesByType) {
    const boards = boardsByType.get(typeName) ?? [];
    const result = solveForType(
      typeName,
      boards,
      pieces,
      kerf,
      minUsefulRemnant,
    );
    if (result.patterns.length > 0) {
      patternsByType[typeName] = result.patterns;
    }
    allUnfulfilled.push(...result.unfulfilled);
  }

  return {
    patternsByType,
    unfulfilled: allUnfulfilled,
    summary: computeSummary(patternsByType, input.stockTypes, minUsefulRemnant),
  };
}
