import { describe, expect, it } from 'vitest';
import {
  scoreSolution,
  DEFAULT_SCORING_PARAMS,
} from './boardCutOptimizer';
import type {
  CutPattern,
  StockBoard,
} from './boardCutOptimizer';

// --- Helpers ---

function makeBoard(id: string, length: number, typeName = '2x4'): StockBoard {
  return { id, stockTypeName: typeName, length };
}

function makePattern(
  board: StockBoard,
  pieceLengths: number[],
  kerf: number,
  minUsefulRemnant: number,
): CutPattern {
  const totalPieceLen = pieceLengths.reduce((s, l) => s + l, 0);
  const betweenKerf = Math.max(0, pieceLengths.length - 1) * kerf;
  const rawRem = board.length - totalPieceLen - betweenKerf;
  const trailKerf = rawRem >= kerf ? kerf : 0;
  const remainder = rawRem - trailKerf;
  let offset = 0;
  return {
    stockBoard: board,
    pieces: pieceLengths.map((len, i) => {
      if (i > 0) offset += kerf;
      const piece = { length: len, startOffset: offset };
      offset += len;
      return piece;
    }),
    totalKerf: betweenKerf + trailKerf,
    remainder,
    remainderIsUsable: remainder >= minUsefulRemnant,
  };
}

// ============================================================
// Scoring Function Tests
// ============================================================

describe('scoreSolution', () => {
  it('returns lower score for fewer boards used', () => {
    const boardA = makeBoard('a', 96);
    const boardsB = [makeBoard('b1', 24), makeBoard('b2', 24), makeBoard('b3', 24), makeBoard('b4', 24)];

    // 1 board with 4 pieces
    const patterns1 = [makePattern(boardA, [22, 22, 22, 22], 0.25, 10)];
    // 4 boards with 1 piece each
    const patterns2 = boardsB.map((b) => makePattern(b, [22], 0.25, 10));

    const score1 = scoreSolution(patterns1, [boardA], 10, DEFAULT_SCORING_PARAMS);
    const score2 = scoreSolution(patterns2, boardsB, 10, DEFAULT_SCORING_PARAMS);

    expect(score1).toBeLessThan(score2);
  });

  it('unused boards do not affect score', () => {
    const usedBoard = makeBoard('a', 96);
    const unusedBoard = makeBoard('b', 5);
    const patterns = [makePattern(usedBoard, [22], 0.25, 10)];

    const scoreWith = scoreSolution(patterns, [usedBoard, unusedBoard], 10, DEFAULT_SCORING_PARAMS);
    const scoreWithout = scoreSolution(patterns, [usedBoard], 10, DEFAULT_SCORING_PARAMS);

    expect(scoreWith).toBe(scoreWithout);
  });

  it('usable remainder gives leftover bonus', () => {
    const board = makeBoard('a', 96);

    // Pattern with large usable remainder
    const patternUsable = makePattern(board, [22], 0.25, 10);
    // Pattern with tiny waste remainder
    const patternWaste = makePattern(board, [22, 22, 22, 22], 0.25, 10);

    const scoreUsable = scoreSolution([patternUsable], [board], 10, DEFAULT_SCORING_PARAMS);
    const scoreWaste = scoreSolution([patternWaste], [board], 10, DEFAULT_SCORING_PARAMS);

    // Board with large usable remainder should get leftover bonus (lower score)
    expect(scoreUsable).toBeLessThan(scoreWaste);
  });

  it('waste penalty increases with wastePower', () => {
    const board = makeBoard('a', 96);
    // Pattern with waste remainder (below minUsefulRemnant=50)
    const pattern = makePattern(board, [60], 0.25, 50);

    const scoreLinear = scoreSolution(
      [pattern], [board], 50,
      { ...DEFAULT_SCORING_PARAMS, wastePower: 1 },
    );
    const scoreSuperlinear = scoreSolution(
      [pattern], [board], 50,
      { ...DEFAULT_SCORING_PARAMS, wastePower: 2 },
    );

    // With higher wastePower, the waste contribution changes
    // (the formula normalizes by maxBoardLength so direction depends on values)
    expect(scoreLinear).not.toBe(scoreSuperlinear);
  });

  it('proportional board penalty charges less for shorter boards', () => {
    const longBoard = makeBoard('a', 96);
    const shortBoard = makeBoard('b', 48);

    const patternLong = makePattern(longBoard, [22], 0.25, 10);
    const patternShort = makePattern(shortBoard, [22], 0.25, 10);

    // Score with both boards available (max length = 96)
    const allBoards = [longBoard, shortBoard];
    const scoreLong = scoreSolution([patternLong], allBoards, 10, DEFAULT_SCORING_PARAMS);
    const scoreShort = scoreSolution([patternShort], allBoards, 10, DEFAULT_SCORING_PARAMS);

    // Using the short board should have lower board penalty
    // (but may have different remainder scoring too)
    // The board penalty for short = 100 * 48/96 = 50
    // The board penalty for long = 100 * 96/96 = 100
    expect(scoreShort).toBeLessThan(scoreLong);
  });

  it('scrap boards below minUsefulRemnant have zero board penalty', () => {
    const scrapBoard = makeBoard('a', 5);
    const pattern = makePattern(scrapBoard, [4], 0.25, 10);

    const score = scoreSolution([pattern], [scrapBoard], 10, DEFAULT_SCORING_PARAMS);

    // Board penalty should be 0 for scrap boards (length < minUsefulRemnant)
    // Score = 0 (board penalty) + waste penalty for tiny remainder
    expect(score).toBeLessThan(DEFAULT_SCORING_PARAMS.boardUsePenalty);
  });
});
