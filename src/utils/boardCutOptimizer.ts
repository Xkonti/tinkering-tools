// --- Input types ---

export interface StockBoard {
  id: string;
  stockTypeName: string;
  length: number;
}

export interface StockType {
  name: string;
  boards: StockBoard[];
}

export interface RequiredPiece {
  stockTypeName: string;
  length: number;
  quantity: number;
  name?: string;
}

export interface CutOptimizerInput {
  stockTypes: StockType[];
  requiredPieces: RequiredPiece[];
  kerf: number;
  minUsefulRemnant: number;
}

// --- Output types ---

export interface PlacedPiece {
  length: number;
  startOffset: number;
  name?: string;
}

export interface CutPattern {
  stockBoard: StockBoard;
  pieces: PlacedPiece[];
  totalKerf: number;
  remainder: number;
  remainderIsUsable: boolean;
}

export interface UnfulfilledPiece {
  stockTypeName: string;
  length: number;
  quantity: number;
  reason: string;
  name?: string;
}

export interface CutOptimizerResult {
  patternsByType: Record<string, CutPattern[]>;
  unfulfilled: UnfulfilledPiece[];
  summary: {
    totalStockUsed: number;
    totalStockLength: number;
    totalPiecesLength: number;
    totalKerf: number;
    totalWaste: number;
    usableRemnants: number;
    efficiencyPercent: number;
  };
}

// --- Algorithm ---

interface DemandItem {
  stockTypeName: string;
  length: number;
  name?: string;
}

interface ActivePattern {
  stockBoard: StockBoard;
  pieces: PlacedPiece[];
  totalKerf: number;
  remainder: number;
}

function spaceNeededForPiece(
  pattern: ActivePattern,
  pieceLength: number,
  kerf: number,
): number {
  return pattern.pieces.length > 0 ? kerf + pieceLength : pieceLength;
}

function placePiece(
  pattern: ActivePattern,
  pieceLength: number,
  kerf: number,
  name?: string,
): void {
  const kerfForCut = pattern.pieces.length > 0 ? kerf : 0;
  const startOffset = pattern.stockBoard.length - pattern.remainder + kerfForCut;

  const piece: PlacedPiece = { length: pieceLength, startOffset };
  if (name) piece.name = name;
  pattern.pieces.push(piece);
  pattern.totalKerf += kerfForCut;
  pattern.remainder -= pieceLength + kerfForCut;
}

export function optimizeCuts(input: CutOptimizerInput): CutOptimizerResult {
  const { kerf, minUsefulRemnant } = input;

  // 1. Expand required pieces into individual demand items, sorted descending
  const demand: DemandItem[] = [];
  for (const rp of input.requiredPieces) {
    for (let i = 0; i < rp.quantity; i++) {
      const item: DemandItem = { stockTypeName: rp.stockTypeName, length: rp.length };
      if (rp.name) item.name = rp.name;
      demand.push(item);
    }
  }
  demand.sort((a, b) => b.length - a.length);

  // 2. Group available stock boards by type, sorted descending by length
  const availableByType = new Map<string, StockBoard[]>();
  for (const st of input.stockTypes) {
    const boards = [...st.boards].sort((a, b) => b.length - a.length);
    availableByType.set(st.name, boards);
  }

  // 3. Track active patterns (opened boards) and unfulfilled items
  const activeByType = new Map<string, ActivePattern[]>();
  const unfulfilledMap = new Map<string, UnfulfilledPiece>();

  // 4. FFD with Best Fit
  for (const item of demand) {
    const actives = activeByType.get(item.stockTypeName) ?? [];

    // Best Fit: find opened board with smallest sufficient remainder
    let bestIdx = -1;
    let bestRemainder = Infinity;

    for (let i = 0; i < actives.length; i++) {
      const pattern = actives[i]!;
      const needed = spaceNeededForPiece(pattern, item.length, kerf);
      if (pattern.remainder >= needed && pattern.remainder < bestRemainder) {
        bestIdx = i;
        bestRemainder = pattern.remainder;
      }
    }

    if (bestIdx >= 0) {
      placePiece(actives[bestIdx]!, item.length, kerf, item.name);
      continue;
    }

    // No open board fits — open a new one
    const available = availableByType.get(item.stockTypeName);
    if (available && available.length > 0) {
      // Find the shortest board that can fit the piece
      let boardIdx = -1;
      for (let i = available.length - 1; i >= 0; i--) {
        if (available[i]!.length >= item.length) {
          boardIdx = i;
          break;
        }
      }

      if (boardIdx >= 0) {
        const board = available.splice(boardIdx, 1)[0]!;
        const pattern: ActivePattern = {
          stockBoard: board,
          pieces: [],
          totalKerf: 0,
          remainder: board.length,
        };
        placePiece(pattern, item.length, kerf, item.name);
        actives.push(pattern);
        activeByType.set(item.stockTypeName, actives);
        continue;
      }
    }

    // Unfulfilled
    const key = `${item.stockTypeName}|${String(item.length)}|${item.name ?? ''}`;
    const existing = unfulfilledMap.get(key);
    if (existing) {
      existing.quantity++;
    } else {
      const hasType = availableByType.has(item.stockTypeName) || activeByType.has(item.stockTypeName);
      const uf: UnfulfilledPiece = {
        stockTypeName: item.stockTypeName,
        length: item.length,
        quantity: 1,
        reason: hasType
          ? `All available ${item.stockTypeName} stock exhausted or too short`
          : `No stock of type "${item.stockTypeName}" defined`,
      };
      if (item.name) uf.name = item.name;
      unfulfilledMap.set(key, uf);
    }
  }

  // 5. Build results
  const patternsByType: Record<string, CutPattern[]> = {};
  let totalStockUsed = 0;
  let totalStockLength = 0;
  let totalPiecesLength = 0;
  let totalKerf = 0;
  let totalWaste = 0;
  let usableRemnants = 0;

  for (const [typeName, patterns] of activeByType) {
    const cutPatterns: CutPattern[] = [];

    for (const p of patterns) {
      const remainderIsUsable = p.remainder >= minUsefulRemnant;
      cutPatterns.push({
        stockBoard: p.stockBoard,
        pieces: p.pieces,
        totalKerf: p.totalKerf,
        remainder: p.remainder,
        remainderIsUsable,
      });

      totalStockUsed++;
      totalStockLength += p.stockBoard.length;
      totalKerf += p.totalKerf;

      for (const piece of p.pieces) {
        totalPiecesLength += piece.length;
      }

      if (remainderIsUsable) {
        usableRemnants += p.remainder;
      } else {
        totalWaste += p.remainder;
      }
    }

    patternsByType[typeName] = cutPatterns;
  }

  const efficiencyPercent =
    totalStockLength > 0
      ? (totalPiecesLength / totalStockLength) * 100
      : 0;

  return {
    patternsByType,
    unfulfilled: [...unfulfilledMap.values()],
    summary: {
      totalStockUsed,
      totalStockLength,
      totalPiecesLength,
      totalKerf,
      totalWaste,
      usableRemnants,
      efficiencyPercent,
    },
  };
}
