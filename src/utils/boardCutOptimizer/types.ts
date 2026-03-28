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

// --- Algorithm selection ---

export type AlgorithmChoice = 'ffd' | 'branchAndBound';

export interface ScoringParams {
  boardUsePenalty: number;
  wastePenalty: number;
  leftoverBonus: number;
  leftoverPower: number;
}

export interface BnBOptions {
  scoringParams: ScoringParams;
  timeLimitMs: number;
}

export interface BnBProgress {
  elapsedMs: number;
  nodesExplored: number;
  bestScore: number;
  boardsUsedInBest: number;
  improved: boolean;
}

export interface BnBStats {
  totalNodesExplored: number;
  totalNodesPruned: number;
  totalElapsedMs: number;
  exhaustive: boolean;
}

// --- Internal types for algorithms ---

export interface DemandItem {
  length: number;
  name?: string;
}

export interface OpenBoard {
  stockBoard: StockBoard;
  pieces: DemandItem[];
  usedLength: number;
  remainingCapacity: number;
}
