import { describe, expect, it } from 'vitest';
import {
  optimizeCuts,
  type CutOptimizerInput,
  type CutOptimizerResult,
} from './boardCutOptimizer';

// --- Helpers ---

let boardIdCounter = 0;

function makeInput(opts: {
  stockTypes: {
    name: string;
    boards: { length: number; quantity: number; name?: string }[];
  }[];
  pieces: {
    stockTypeName: string;
    length: number;
    quantity: number;
    name?: string;
  }[];
  kerf?: number;
  minUsefulRemnant?: number;
}): CutOptimizerInput {
  return {
    stockTypes: opts.stockTypes.map((st) => ({
      name: st.name,
      boards: st.boards.flatMap((b) =>
        Array.from({ length: b.quantity }, () => ({
          id: `board-${String(++boardIdCounter)}`,
          stockTypeName: st.name,
          length: b.length,
          ...(b.name ? { name: b.name } : {}),
        })),
      ),
    })),
    requiredPieces: opts.pieces.map((p) => ({
      stockTypeName: p.stockTypeName,
      length: p.length,
      quantity: p.quantity,
      ...(p.name ? { name: p.name } : {}),
    })),
    kerf: opts.kerf ?? 0.125,
    minUsefulRemnant: opts.minUsefulRemnant ?? 10,
  };
}

/** Get boards used for a specific stock type, sorted by board length ascending */
function usedBoards(result: CutOptimizerResult, typeName: string) {
  const patterns = result.patternsByType[typeName] ?? [];
  return patterns
    .map((p) => ({
      boardLength: p.stockBoard.length,
      boardName: p.stockBoard.name,
      pieceLengths: p.pieces.map((pc) => pc.length),
      pieceNames: p.pieces.map((pc) => pc.name),
      remainder: p.remainder,
      totalKerf: p.totalKerf,
      remainderIsUsable: p.remainderIsUsable,
    }))
    .sort((a, b) => a.boardLength - b.boardLength);
}

function totalPiecesPlaced(result: CutOptimizerResult): number {
  let count = 0;
  for (const patterns of Object.values(result.patternsByType)) {
    for (const p of patterns) {
      count += p.pieces.length;
    }
  }
  return count;
}

// --- Tests ---

describe('boardCutOptimizer', () => {
  // =============================================================
  // USER-VERIFIED TEST SCENARIO
  // Exact expected output confirmed by user.
  // =============================================================
  describe('user-verified: 24" offcuts + 92.5" boards, 10x 22" pieces', () => {
    it('uses all 4 offcuts, packs 4 pieces on one long board, 2 on another', () => {
      // Setup: kerf 0.25, minUsefulRemnant 10
      // Stock: 11x 92.5" + 4x 24"
      // Required: 10x 22"
      //
      // Kerf model: every piece gets a trim cut (kerf) after it.
      //   N pieces = N kerfs.
      //
      // Expected:
      //   4x 24" board, each 1x 22" piece. Kerf 0.25. Remainder: 24 - 22 - 0.25 = 1.75" (waste)
      //   1x 92.5" board, 4x 22" pieces. 4 kerfs = 1.0". Remainder: 92.5 - 88 - 1.0 = 3.5" (waste)
      //   1x 92.5" board, 2x 22" pieces. 2 kerfs = 0.5". Remainder: 92.5 - 44 - 0.5 = 48.0" (usable)
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 92.5, quantity: 11 },
                { length: 24, quantity: 4 },
              ],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 10 }],
          kerf: 0.25,
          minUsefulRemnant: 10,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(totalPiecesPlaced(result)).toBe(10);

      const boards = usedBoards(result, '2x4');
      expect(boards).toHaveLength(6);

      // 4 offcut boards (24"), each with 1 piece
      const offcuts = boards.filter((b) => b.boardLength === 24);
      expect(offcuts).toHaveLength(4);
      for (const oc of offcuts) {
        expect(oc.pieceLengths).toEqual([22]);
        expect(oc.totalKerf).toBeCloseTo(0.25, 6);
        expect(oc.remainder).toBeCloseTo(1.75, 6);
        expect(oc.remainderIsUsable).toBe(false);
      }

      // 2 long boards (92.5")
      const longBoards = boards.filter((b) => b.boardLength === 92.5);
      expect(longBoards).toHaveLength(2);

      // Sort by piece count to get the 4-piece and 2-piece boards
      longBoards.sort((a, b) => a.pieceLengths.length - b.pieceLengths.length);

      // Board with 2 pieces: remainder = 92.5 - 44 - 0.5 = 48.0 (usable)
      expect(longBoards[0]!.pieceLengths).toHaveLength(2);
      expect(longBoards[0]!.totalKerf).toBeCloseTo(0.5, 6);
      expect(longBoards[0]!.remainder).toBeCloseTo(48.0, 6);
      expect(longBoards[0]!.remainderIsUsable).toBe(true);

      // Board with 4 pieces: remainder = 92.5 - 88 - 1.0 = 3.5 (waste)
      expect(longBoards[1]!.pieceLengths).toHaveLength(4);
      expect(longBoards[1]!.totalKerf).toBeCloseTo(1.0, 6);
      expect(longBoards[1]!.remainder).toBeCloseTo(3.5, 6);
      expect(longBoards[1]!.remainderIsUsable).toBe(false);
    });
  });

  describe('basic placement', () => {
    it('places a single piece on the only available board', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [{ name: '2x4', boards: [{ length: 96, quantity: 1 }] }],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      expect(totalPiecesPlaced(result)).toBe(1);
    });

    it('places multiple pieces of the same length', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 5 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 4 }],
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(totalPiecesPlaced(result)).toBe(4);
    });

    it('packs multiple pieces onto one board when they fit', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 3 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 4 }],
          kerf: 0.25,
        }),
      );

      // 4 pieces of 22" + 4 kerfs of 0.25" = 89.0" — fits on one 96" board
      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      expect(totalPiecesPlaced(result)).toBe(4);
    });
  });

  describe('short boards used first', () => {
    it('uses a 23" board for a 22" piece instead of a 96" board', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 96, quantity: 1 },
                { length: 23, quantity: 1 },
              ],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      const boards = usedBoards(result, '2x4');
      expect(boards).toHaveLength(1);
      expect(boards[0]!.boardLength).toBe(23);
    });

    it('uses two 23" boards for two 22" pieces, preserving 96" board', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 96, quantity: 1 },
                { length: 23, quantity: 2 },
              ],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 2 }],
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(2);
      const boards = usedBoards(result, '2x4');
      expect(boards.every((b) => b.boardLength === 23)).toBe(true);
    });

    it('uses offcuts before full-length boards', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 92.5, quantity: 10, name: 'Home Depot' },
                { length: 24, quantity: 5, name: 'Offcut' },
              ],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 5 }],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      // All 5 pieces should go on offcuts (24" boards), not Home Depot boards
      const boards = usedBoards(result, '2x4');
      expect(boards.every((b) => b.boardLength === 24)).toBe(true);
    });
  });

  describe('FFD packing behavior', () => {
    it('uses short board for first piece and long board for remaining', () => {
      // FFD opens shortest board first. If the second piece doesn't fit,
      // it opens a long board. Short boards stay used (offcuts consumed).
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 96, quantity: 1 },
                { length: 25, quantity: 1 },
              ],
            },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 22, quantity: 1 },
            { stockTypeName: '2x4', length: 20, quantity: 1 },
          ],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      // FFD: 22" -> opens 25" (shortest). 20" -> 25" has 2.75 remaining,
      // needs 20.25. Doesn't fit. Opens 96".
      // Result: 2 boards used — offcut consumed, long board used for overflow.
      expect(result.summary.totalStockUsed).toBe(2);
      const boards = usedBoards(result, '2x4');
      expect(boards[0]!.boardLength).toBe(25);
      expect(boards[1]!.boardLength).toBe(96);
    });

    it('packs pieces onto already-open boards before opening new ones', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 96, quantity: 1 },
                { length: 48, quantity: 1 },
              ],
            },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 46, quantity: 1 },
            { stockTypeName: '2x4', length: 22, quantity: 1 },
          ],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      // FFD: 46" -> opens 48" board. Remaining: 48 - 46.25 = 1.75.
      // 22" -> 48" has 1.75 (needs 22.25, no). Opens 96". Remaining: 73.75.
      expect(result.summary.totalStockUsed).toBe(2);
    });
  });

  describe('kerf handling', () => {
    it('kerf between pieces + trailing kerf after last piece', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 44.375, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 2 }],
          kerf: 0.125,
        }),
      );

      // 2 pieces of 22 + 1 between kerf + 1 trailing kerf = 44 + 0.25 = 44.25
      // Board 44.375 - 44.25 = 0.125 remainder (< 10, waste)
      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      const boards = usedBoards(result, '2x4');
      expect(boards[0]!.pieceLengths).toEqual([22, 22]);
      expect(boards[0]!.totalKerf).toBeCloseTo(0.25, 6);
      expect(boards[0]!.remainder).toBeCloseTo(0.125, 6);
    });

    it('two pieces fit if between-kerf fits even without trailing kerf room', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 44.125, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 2 }],
          kerf: 0.125,
        }),
      );

      // 22 + 0.125(between) + 22 = 44.125 — exactly fits (no room for trailing kerf)
      // Raw remainder = 44.125 - 44 - 0.125 = 0. Trailing kerf: 0 < 0.125, so none.
      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      const boards = usedBoards(result, '2x4');
      expect(boards[0]!.totalKerf).toBeCloseTo(0.125, 6); // only between-kerf
      expect(boards[0]!.remainder).toBeCloseTo(0, 6);
    });

    it('works correctly with zero kerf', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 44, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 2 }],
          kerf: 0,
        }),
      );

      // 22 + 22 = 44 — exactly fits with no kerf
      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
    });

    it('computes correct startOffset for placed pieces', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 1 }] },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 30, quantity: 1 },
            { stockTypeName: '2x4', length: 20, quantity: 1 },
            { stockTypeName: '2x4', length: 10, quantity: 1 },
          ],
          kerf: 0.25,
        }),
      );

      const patterns = result.patternsByType['2x4']!;
      expect(patterns).toHaveLength(1);
      const pieces = patterns[0]!.pieces;

      // Pieces sorted longest first by FFD, kerf between pieces for display
      // Piece 0: offset 0, length 30
      // Piece 1: offset 30 + 0.25 = 30.25, length 20
      // Piece 2: offset 30.25 + 20 + 0.25 = 50.5, length 10
      expect(pieces[0]!.startOffset).toBeCloseTo(0, 6);
      expect(pieces[1]!.startOffset).toBeCloseTo(30.25, 6);
      expect(pieces[2]!.startOffset).toBeCloseTo(50.5, 6);

      // Total kerf = 2 between + 1 trailing = 3 * 0.25 = 0.75
      // (raw remainder = 96 - 60 - 0.5 = 35.5 >= 0.25, so trailing applies)
      expect(patterns[0]!.totalKerf).toBeCloseTo(0.75, 6);
      // Remainder = 96 - 60 - 0.75 = 35.25
      expect(patterns[0]!.remainder).toBeCloseTo(35.25, 6);
    });

    it('single piece on a board gets trailing kerf if room exists', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 24, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      const boards = usedBoards(result, '2x4');
      // Raw remainder = 24 - 22 = 2. 2 >= 0.25 so trailing kerf applied.
      // 24 - 22 - 0.25 = 1.75
      expect(boards[0]!.totalKerf).toBeCloseTo(0.25, 6);
      expect(boards[0]!.remainder).toBeCloseTo(1.75, 6);
    });

    it('no trailing kerf when piece fits board perfectly', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 22, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      const boards = usedBoards(result, '2x4');
      // Raw remainder = 0. 0 < 0.25 so no trailing kerf.
      expect(boards[0]!.totalKerf).toBeCloseTo(0, 6);
      expect(boards[0]!.remainder).toBeCloseTo(0, 6);
    });

    it('no trailing kerf when remainder is smaller than kerf', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 22.1, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      const boards = usedBoards(result, '2x4');
      // Raw remainder = 0.1. 0.1 < 0.25 so no trailing kerf.
      expect(boards[0]!.totalKerf).toBeCloseTo(0, 6);
      expect(boards[0]!.remainder).toBeCloseTo(0.1, 6);
    });
  });

  describe('unfulfilled pieces', () => {
    it('reports pieces that are too long for any board', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 48, quantity: 5 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 50, quantity: 3 }],
        }),
      );

      // 50 > 48 — piece physically exceeds board
      expect(result.unfulfilled).toHaveLength(1);
      expect(result.unfulfilled[0]!.length).toBe(50);
      expect(result.unfulfilled[0]!.quantity).toBe(3);
      expect(result.unfulfilled[0]!.reason).toContain('long');
    });

    it('reports pieces when not enough stock is available', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 24, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 3 }],
        }),
      );

      // Only 1 board of 24", can fit only 1 piece of 22"
      expect(totalPiecesPlaced(result)).toBe(1);
      expect(result.unfulfilled).toHaveLength(1);
      expect(result.unfulfilled[0]!.quantity).toBe(2);
    });

    it('fulfills what it can and reports the rest', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 2 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 90, quantity: 3 }],
        }),
      );

      // 2 boards, each can hold 1 piece of 90" (90 + 0.125 = 90.125 <= 96)
      expect(totalPiecesPlaced(result)).toBe(2);
      expect(result.unfulfilled).toHaveLength(1);
      expect(result.unfulfilled[0]!.quantity).toBe(1);
    });
  });

  describe('piece and board names', () => {
    it('preserves piece names in output', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 1 }] },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 30, quantity: 1, name: 'Shelf A' },
            { stockTypeName: '2x4', length: 20, quantity: 1, name: 'Shelf B' },
          ],
        }),
      );

      const pieces = result.patternsByType['2x4']![0]!.pieces;
      const names = pieces.map((p) => p.name).sort();
      expect(names).toEqual(['Shelf A', 'Shelf B']);
    });

    it('preserves piece names correctly when same length but different names', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 1 }] },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 24, quantity: 1, name: 'Left' },
            { stockTypeName: '2x4', length: 24, quantity: 1, name: 'Right' },
          ],
        }),
      );

      const pieces = result.patternsByType['2x4']![0]!.pieces;
      const names = new Set(pieces.map((p) => p.name));
      expect(names).toContain('Left');
      expect(names).toContain('Right');
    });

    it('preserves board names in output', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [{ length: 96, quantity: 1, name: 'Home Depot' }],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
        }),
      );

      const pattern = result.patternsByType['2x4']![0]!;
      expect(pattern.stockBoard.name).toBe('Home Depot');
    });

    it('includes names in unfulfilled pieces', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 10, quantity: 1 }] },
          ],
          pieces: [
            {
              stockTypeName: '2x4',
              length: 50,
              quantity: 2,
              name: 'Long Rail',
            },
          ],
        }),
      );

      expect(result.unfulfilled).toHaveLength(1);
      expect(result.unfulfilled[0]!.name).toBe('Long Rail');
    });
  });

  describe('summary statistics', () => {
    it('computes correct summary for a simple case', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 5 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 4 }],
          kerf: 0.25,
        }),
      );

      // 4 pieces of 22" + 3 between-kerfs + 1 trailing kerf = 88 + 1.0 on one 96" board
      // Raw remainder = 96 - 88 - 0.75 = 7.25. 7.25 >= 0.25 so trailing kerf applied.
      expect(result.summary.totalStockUsed).toBe(1);
      expect(result.summary.totalStockLength).toBe(96);
      expect(result.summary.totalPiecesLength).toBe(88);
      expect(result.summary.totalKerf).toBeCloseTo(1.0, 6);
      // Remainder: 96 - 88 - 1.0 = 7.0 (< 10, so waste)
      expect(result.summary.totalWaste).toBeCloseTo(7.0, 6);
      expect(result.summary.usableRemnants).toBe(0);
      // 4 unused boards = 4 * 96 = 384 preserved
      expect(result.summary.preservedStockLength).toBe(384);
      expect(result.summary.efficiencyPercent).toBeCloseTo(
        (88 / 96) * 100,
        1,
      );
    });

    it('correctly classifies usable remnants vs waste', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
          kerf: 0,
          minUsefulRemnant: 50,
        }),
      );

      // Remainder: 96 - 22 = 74. Trailing kerf: 0 (kerf is 0). So remainder = 74 >= 50, usable.
      expect(result.summary.usableRemnants).toBe(74);
      expect(result.summary.totalWaste).toBe(0);
    });
  });

  describe('multiple stock types', () => {
    it('handles pieces for different stock types independently', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 5 }] },
            { name: '1x6', boards: [{ length: 72, quantity: 5 }] },
          ],
          pieces: [
            { stockTypeName: '2x4', length: 22, quantity: 2 },
            { stockTypeName: '1x6', length: 30, quantity: 2 },
          ],
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(result.patternsByType['2x4']).toBeDefined();
      expect(result.patternsByType['1x6']).toBeDefined();

      for (const p of result.patternsByType['2x4']!) {
        expect(p.stockBoard.stockTypeName).toBe('2x4');
      }
      for (const p of result.patternsByType['1x6']!) {
        expect(p.stockBoard.stockTypeName).toBe('1x6');
      }
    });
  });

  describe('edge cases', () => {
    it('handles piece that exactly matches board length (no trailing kerf)', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 22, quantity: 1 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 1 }],
          kerf: 0.125,
        }),
      );

      // Piece exactly fills board — no room for trailing kerf, remainder = 0
      expect(result.unfulfilled).toHaveLength(0);
      expect(result.summary.totalStockUsed).toBe(1);
      const boards = usedBoards(result, '2x4');
      expect(boards[0]!.remainder).toBeCloseTo(0, 6);
      expect(boards[0]!.totalKerf).toBeCloseTo(0, 6);
    });

    it('returns empty result when no pieces are required', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 5 }] },
          ],
          pieces: [],
        }),
      );

      expect(result.summary.totalStockUsed).toBe(0);
      expect(result.unfulfilled).toHaveLength(0);
    });

    it('handles many small pieces efficiently packed onto boards', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            { name: '2x4', boards: [{ length: 96, quantity: 10 }] },
          ],
          pieces: [{ stockTypeName: '2x4', length: 10, quantity: 20 }],
          kerf: 0.25,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      // Each piece takes 10 + 0.25 = 10.25". Board fits floor(96 / 10.25) = 9 pieces.
      // 9 * 10.25 = 92.25 <= 96. 10 * 10.25 = 102.5 > 96.
      // 20 pieces / 9 per board = 3 boards (9 + 9 + 2)
      expect(result.summary.totalStockUsed).toBeLessThanOrEqual(3);
      expect(totalPiecesPlaced(result)).toBe(20);
    });

    it('offcuts too small for any piece are left untouched', () => {
      const result = optimizeCuts(
        makeInput({
          stockTypes: [
            {
              name: '2x4',
              boards: [
                { length: 92.5, quantity: 11 },
                { length: 4, quantity: 24 },
              ],
            },
          ],
          pieces: [{ stockTypeName: '2x4', length: 22, quantity: 10 }],
          kerf: 0.125,
        }),
      );

      expect(result.unfulfilled).toHaveLength(0);
      expect(totalPiecesPlaced(result)).toBe(10);
      // Only 92.5" boards used, 4" boards untouched
      const boards = usedBoards(result, '2x4');
      expect(boards.every((b) => b.boardLength === 92.5)).toBe(true);
    });
  });
});
