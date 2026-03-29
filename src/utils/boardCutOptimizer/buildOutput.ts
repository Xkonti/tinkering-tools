import type {
  CutPattern,
  CutOptimizerResult,
  StockType,
} from './types';

export function computeSummary(
  patternsByType: Record<string, CutPattern[]>,
  stockTypes: StockType[],
  minUsefulRemnant: number,
): CutOptimizerResult['summary'] {
  let totalStockUsed = 0;
  let totalStockLength = 0;
  let totalPiecesLength = 0;
  let totalKerf = 0;
  let totalWaste = 0;
  let usableRemnants = 0;

  const usedBoardIds = new Set<string>();

  for (const patterns of Object.values(patternsByType)) {
    for (const p of patterns) {
      totalStockUsed++;
      totalStockLength += p.stockBoard.length;
      totalKerf += p.totalKerf;
      usedBoardIds.add(p.stockBoard.id);
      for (const piece of p.pieces) {
        totalPiecesLength += piece.length;
      }
      if (p.remainderIsUsable) {
        usableRemnants += p.remainder;
      } else {
        totalWaste += p.remainder;
      }
    }
  }

  // Unused boards: short ones count as waste, long ones as preserved
  let preservedStockLength = 0;
  for (const st of stockTypes) {
    for (const b of st.boards) {
      if (usedBoardIds.has(b.id)) continue;
      if (b.length < minUsefulRemnant) {
        totalWaste += b.length;
      } else {
        preservedStockLength += b.length;
      }
    }
  }

  const efficiencyPercent =
    totalStockLength > 0
      ? (totalPiecesLength / totalStockLength) * 100
      : 0;

  return {
    totalStockUsed,
    totalStockLength,
    totalPiecesLength,
    totalKerf,
    totalWaste,
    usableRemnants,
    preservedStockLength,
    efficiencyPercent,
  };
}
