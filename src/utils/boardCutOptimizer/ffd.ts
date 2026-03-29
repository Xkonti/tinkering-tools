import type {
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  RequiredPiece,
  StockBoard,
  UnfulfilledPiece,
} from './types';
import {
  aggregateUnfulfilled,
  buildCutPatterns,
  computeSummary,
} from './buildOutput';
import { expandDemand, ffdPlace } from './shared';

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
