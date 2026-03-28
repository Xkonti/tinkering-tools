import type {
  CutPattern,
  CutOptimizerResult,
  DemandItem,
  OpenBoard,
  PlacedPiece,
  StockType,
  UnfulfilledPiece,
} from './types';

export function buildCutPatterns(
  openBoards: OpenBoard[],
  kerf: number,
  minUsefulRemnant: number,
): CutPattern[] {
  const patterns: CutPattern[] = [];

  for (const board of openBoards) {
    const placedPieces: PlacedPiece[] = [];
    let offset = 0;

    for (let i = 0; i < board.pieces.length; i++) {
      const item = board.pieces[i]!;
      if (i > 0) offset += kerf;

      const piece: PlacedPiece = {
        length: item.length,
        startOffset: offset,
      };
      if (item.name) piece.name = item.name;
      placedPieces.push(piece);
      offset += item.length;
    }

    const n = placedPieces.length;
    const piecesLen = placedPieces.reduce((s, p) => s + p.length, 0);
    const betweenKerf = Math.max(0, n - 1) * kerf;
    // Trailing kerf (trim cut after last piece) only if enough board remains
    const rawRemainder = board.stockBoard.length - piecesLen - betweenKerf;
    const trailingKerf = rawRemainder >= kerf ? kerf : 0;
    const totalKerf = betweenKerf + trailingKerf;
    const remainder = board.stockBoard.length - piecesLen - totalKerf;

    patterns.push({
      stockBoard: board.stockBoard,
      pieces: placedPieces,
      totalKerf,
      remainder,
      remainderIsUsable: remainder >= minUsefulRemnant,
    });
  }

  return patterns;
}

export function aggregateUnfulfilled(
  items: DemandItem[],
  typeName: string,
): UnfulfilledPiece[] {
  const groups = new Map<string, UnfulfilledPiece>();

  for (const item of items) {
    const key = `${String(item.length)}|${item.name ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity++;
    } else {
      const uf: UnfulfilledPiece = {
        stockTypeName: typeName,
        length: item.length,
        quantity: 1,
        reason: 'Not enough stock available',
      };
      if (item.name) uf.name = item.name;
      groups.set(key, uf);
    }
  }

  return [...groups.values()];
}

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
