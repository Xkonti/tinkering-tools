// --- Input types ---

export interface StockBoard {
  id: string;
  stockTypeName: string;
  length: number;
  name?: string;
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
    preservedStockLength: number;
    efficiencyPercent: number;
  };
}

// --- Scoring ---

export interface ScoringParams {
  boardUsePenalty: number;
  wastePenalty: number;
  wastePower: number;
  leftoverBonus: number;
  leftoverPower: number;
}
