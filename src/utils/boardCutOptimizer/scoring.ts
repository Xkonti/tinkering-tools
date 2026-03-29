import type { CutPattern, ScoringParams, StockBoard } from './types';

export const DEFAULT_SCORING_PARAMS: ScoringParams = {
  boardUsePenalty: 500,
  wastePenalty: 1,
  wastePower: 1.5,
  leftoverBonus: 50,
  leftoverPower: 0.2,
};

function leftoverValue(
  length: number,
  maxBoardLength: number,
  power: number,
): number {
  if (maxBoardLength <= 0) return 0;
  return Math.pow(length / maxBoardLength, power);
}

function wasteValue(
  length: number,
  maxBoardLength: number,
  power: number,
): number {
  if (maxBoardLength <= 0) return 0;
  // When power=1: length * pow(length/max, 0) = length (backward compatible)
  // When power>1: larger waste pieces penalized disproportionately
  return length * Math.pow(length / maxBoardLength, power - 1);
}

/**
 * Score a complete solution. Lower is better.
 *
 * score = boardUsePenalty * boards_used
 *       + wastePenalty * SUM(waste_value(waste_remainders))
 *       - leftoverBonus * SUM(leftover_value(usable_remainders))
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
  // Max board length per stock type (for proportional board penalty)
  const maxLenByType = new Map<string, number>();
  for (const b of allBoards) {
    const cur = maxLenByType.get(b.stockTypeName) ?? 0;
    if (b.length > cur) maxLenByType.set(b.stockTypeName, b.length);
  }

  let score = 0;

  // Used boards: board penalty + remainder scoring
  for (const p of patterns) {
    // Proportional board penalty (scrap boards below minUsefulRemnant are free)
    if (p.stockBoard.length >= minUsefulRemnant) {
      const typeMax = maxLenByType.get(p.stockBoard.stockTypeName) ?? p.stockBoard.length;
      score += params.boardUsePenalty * (p.stockBoard.length / typeMax);
    }

    if (p.remainderIsUsable) {
      score -=
        params.leftoverBonus *
        leftoverValue(p.remainder, maxBoardLength, params.leftoverPower);
    } else {
      score +=
        params.wastePenalty *
        wasteValue(p.remainder, maxBoardLength, params.wastePower);
    }
  }

  // Unused boards: no score contribution (stock on the shelf is neutral)

  return score;
}

/**
 * Score breakdown for a single board or unused board.
 */
export interface BoardScoreBreakdown {
  boardUsePenalty: number;
  wasteContribution: number;
  leftoverContribution: number;
  total: number;
}

export interface ScoreBreakdown {
  usedBoards: {
    boardName: string;
    boardLength: number;
    remainder: number;
    remainderIsUsable: boolean;
    breakdown: BoardScoreBreakdown;
  }[];
  unusedBoards: {
    boardName: string;
    boardLength: number;
    isUsable: boolean;
    breakdown: BoardScoreBreakdown;
  }[];
  totals: {
    boardUsePenalty: number;
    wasteContribution: number;
    leftoverContribution: number;
    total: number;
  };
}

export function computeScoreBreakdown(
  patterns: CutPattern[],
  allBoards: StockBoard[],
  minUsefulRemnant: number,
  params: ScoringParams,
): ScoreBreakdown {
  const maxBoardLength = allBoards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );
  const usedBoardIds = new Set(patterns.map((p) => p.stockBoard.id));

  const totals = {
    boardUsePenalty: 0,
    wasteContribution: 0,
    leftoverContribution: 0,
    total: 0,
  };

  // Max board length per stock type
  const maxLenByType2 = new Map<string, number>();
  for (const b of allBoards) {
    const cur = maxLenByType2.get(b.stockTypeName) ?? 0;
    if (b.length > cur) maxLenByType2.set(b.stockTypeName, b.length);
  }

  const usedBoards = patterns.map((p) => {
    let bup = 0;
    if (p.stockBoard.length >= minUsefulRemnant) {
      const typeMax = maxLenByType2.get(p.stockBoard.stockTypeName) ?? p.stockBoard.length;
      bup = params.boardUsePenalty * (p.stockBoard.length / typeMax);
    }
    let waste = 0;
    let leftover = 0;
    if (p.remainderIsUsable) {
      leftover =
        -params.leftoverBonus *
        leftoverValue(p.remainder, maxBoardLength, params.leftoverPower);
    } else {
      waste =
        params.wastePenalty *
        wasteValue(p.remainder, maxBoardLength, params.wastePower);
    }
    totals.boardUsePenalty += bup;
    totals.wasteContribution += waste;
    totals.leftoverContribution += leftover;
    return {
      boardName: p.stockBoard.name ?? p.stockBoard.id,
      boardLength: p.stockBoard.length,
      remainder: p.remainder,
      remainderIsUsable: p.remainderIsUsable,
      breakdown: {
        boardUsePenalty: bup,
        wasteContribution: waste,
        leftoverContribution: leftover,
        total: bup + waste + leftover,
      },
    };
  });

  // Unused boards: no score contribution (stock on the shelf is neutral)
  const unusedBoards: ScoreBreakdown['unusedBoards'] = [];
  for (const board of allBoards) {
    if (usedBoardIds.has(board.id)) continue;
    unusedBoards.push({
      boardName: board.name ?? board.id,
      boardLength: board.length,
      isUsable: board.length >= minUsefulRemnant,
      breakdown: {
        boardUsePenalty: 0,
        wasteContribution: 0,
        leftoverContribution: 0,
        total: 0,
      },
    });
  }

  totals.total =
    totals.boardUsePenalty +
    totals.wasteContribution +
    totals.leftoverContribution;

  return { usedBoards, unusedBoards, totals };
}
