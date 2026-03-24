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

// ============================================================
// Internal types for FFD algorithm
// ============================================================

interface DemandItem {
  length: number;
  name?: string;
}

interface OpenBoard {
  stockBoard: StockBoard;
  pieces: DemandItem[];
  usedLength: number;
  remainingCapacity: number;
}

// ============================================================
// Phase 1: Expand demand & validate
// ============================================================

function expandDemand(
  requiredPieces: RequiredPiece[],
  maxBoardLength: number,
  typeName: string,
): { demandItems: DemandItem[]; unfulfilled: UnfulfilledPiece[] } {
  const demandItems: DemandItem[] = [];
  const unfulfilled: UnfulfilledPiece[] = [];

  for (const rp of requiredPieces) {
    if (rp.length > maxBoardLength + 1e-9) {
      const uf: UnfulfilledPiece = {
        stockTypeName: typeName,
        length: rp.length,
        quantity: rp.quantity,
        reason: 'No board long enough for this piece',
      };
      if (rp.name) uf.name = rp.name;
      unfulfilled.push(uf);
      continue;
    }
    for (let i = 0; i < rp.quantity; i++) {
      const item: DemandItem = { length: rp.length };
      if (rp.name) item.name = rp.name;
      demandItems.push(item);
    }
  }

  // FFD: sort longest first
  demandItems.sort((a, b) => b.length - a.length);
  return { demandItems, unfulfilled };
}

// ============================================================
// Phase 2: First Fit Decreasing placement
// ============================================================

function placeOnBoard(
  board: OpenBoard,
  item: DemandItem,
  kerf: number,
): void {
  // Between-piece kerf (cut to separate from previous piece)
  const betweenKerf = board.pieces.length > 0 ? kerf : 0;
  board.pieces.push(item);
  board.usedLength += betweenKerf + item.length;
  board.remainingCapacity = board.stockBoard.length - board.usedLength;
}

function ffdPlace(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): { openBoards: OpenBoard[]; unfulfilled: DemandItem[] } {
  const openBoards: OpenBoard[] = [];
  // Sort available boards ascending by length (shortest first)
  const unopened = [...boards].sort((a, b) => a.length - b.length);
  const unfulfilled: DemandItem[] = [];

  for (const item of demandItems) {
    // 1. Try open boards — best fit (least remaining after placement)
    let bestIdx = -1;
    let bestRemaining = Infinity;

    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const spaceNeeded =
        item.length + (board.pieces.length > 0 ? kerf : 0);
      if (spaceNeeded <= board.remainingCapacity + 1e-9) {
        const remainingAfter = board.remainingCapacity - spaceNeeded;
        if (remainingAfter < bestRemaining) {
          bestRemaining = remainingAfter;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      placeOnBoard(openBoards[bestIdx]!, item, kerf);
      continue;
    }

    // 2. Open the shortest unopened board that fits
    let opened = false;
    for (let i = 0; i < unopened.length; i++) {
      const sb = unopened[i]!;
      if (item.length <= sb.length + 1e-9) {
        const newBoard: OpenBoard = {
          stockBoard: sb,
          pieces: [],
          usedLength: 0,
          remainingCapacity: sb.length,
        };
        placeOnBoard(newBoard, item, kerf);
        openBoards.push(newBoard);
        unopened.splice(i, 1);
        opened = true;
        break;
      }
    }

    if (!opened) {
      unfulfilled.push(item);
    }
  }

  return { openBoards, unfulfilled };
}

// ============================================================
// Phase 3: Build output
// ============================================================

function buildCutPatterns(
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

function aggregateUnfulfilled(
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

  // Compute summary
  let totalStockUsed = 0;
  let totalStockLength = 0;
  let totalPiecesLength = 0;
  let totalKerf = 0;
  let totalWaste = 0;
  let usableRemnants = 0;

  for (const patterns of Object.values(patternsByType)) {
    for (const p of patterns) {
      totalStockUsed++;
      totalStockLength += p.stockBoard.length;
      totalKerf += p.totalKerf;
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

  let totalInputStockLength = 0;
  for (const st of input.stockTypes) {
    for (const b of st.boards) {
      totalInputStockLength += b.length;
    }
  }
  const preservedStockLength = totalInputStockLength - totalStockLength;

  const efficiencyPercent =
    totalStockLength > 0
      ? (totalPiecesLength / totalStockLength) * 100
      : 0;

  return {
    patternsByType,
    unfulfilled: allUnfulfilled,
    summary: {
      totalStockUsed,
      totalStockLength,
      totalPiecesLength,
      totalKerf,
      totalWaste,
      usableRemnants,
      preservedStockLength,
      efficiencyPercent,
    },
  };
}
