import type { CutPattern, ScoringParams, StockBoard } from './types';

export const DEFAULT_SCORING_PARAMS: ScoringParams = {
  boardUsePenalty: 100,
  wastePenalty: 1,
  leftoverBonus: 50,
  leftoverPower: 1.5,
};

function leftoverValue(
  length: number,
  maxBoardLength: number,
  power: number,
): number {
  if (maxBoardLength <= 0) return 0;
  return Math.pow(length / maxBoardLength, power);
}

/**
 * Score a complete solution. Lower is better.
 *
 * score = boardUsePenalty * boards_used
 *       + wastePenalty * total_waste
 *       - leftoverBonus * SUM(leftover_value(usable_remainder))
 *
 * Unused boards >= minUsefulRemnant get leftover bonus.
 * Unused boards < minUsefulRemnant count as waste.
 */
export function scoreSolution(
  patterns: CutPattern[],
  allBoards: StockBoard[],
  minUsefulRemnant: number,
  params: ScoringParams,
): number {
  const maxBoardLength = allBoards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );
  const usedBoardIds = new Set(patterns.map((p) => p.stockBoard.id));

  let score = 0;

  // Cost per board used
  score += params.boardUsePenalty * patterns.length;

  // Used boards: remainder scoring
  for (const p of patterns) {
    if (p.remainderIsUsable) {
      score -=
        params.leftoverBonus *
        leftoverValue(p.remainder, maxBoardLength, params.leftoverPower);
    } else {
      score += params.wastePenalty * p.remainder;
    }
  }

  // Unused boards
  for (const board of allBoards) {
    if (usedBoardIds.has(board.id)) continue;
    if (board.length >= minUsefulRemnant) {
      score -=
        params.leftoverBonus *
        leftoverValue(board.length, maxBoardLength, params.leftoverPower);
    } else {
      score += params.wastePenalty * board.length;
    }
  }

  return score;
}
