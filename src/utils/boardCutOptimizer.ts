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
// Internal types for Branch & Bound algorithm
// ============================================================

interface PieceType {
  length: number;
  demand: number;
}

interface PatternDef {
  counts: number[];
  numPieces: number;
  remainder: number;
  wasteRemainder: number;
}

interface BoardGroup {
  length: number;
  name?: string;
  count: number;
  boards: StockBoard[];
  patterns: PatternDef[];
}

interface AllocEntry {
  patternIdx: number;
  count: number;
}

interface BnBSolution {
  groupAllocations: AllocEntry[][];
  unfulfilled: number;
  waste: number;
  consumedCost: number;
}

// ============================================================
// Phase 1: Pattern enumeration (bounded knapsack)
// ============================================================

function enumeratePatterns(
  boardLength: number,
  pieceTypes: PieceType[],
  kerf: number,
  minUsefulRemnant: number,
): PatternDef[] {
  const patterns: PatternDef[] = [];
  const counts = new Array<number>(pieceTypes.length).fill(0);

  function search(
    pieceIdx: number,
    totalPieceLen: number,
    numPieces: number,
  ): void {
    if (numPieces > 0) {
      const totalKerf = (numPieces - 1) * kerf;
      const remainder = boardLength - totalPieceLen - totalKerf;
      patterns.push({
        counts: [...counts],
        numPieces,
        remainder,
        wasteRemainder: remainder < minUsefulRemnant ? remainder : 0,
      });
    }

    for (let i = pieceIdx; i < pieceTypes.length; i++) {
      const pt = pieceTypes[i]!;
      for (let qty = 1; qty <= pt.demand; qty++) {
        const newPieceLen = totalPieceLen + qty * pt.length;
        const newNum = numPieces + qty;
        const newKerf = (newNum - 1) * kerf;
        if (newPieceLen + newKerf > boardLength + 1e-9) break;

        counts[i] = qty;
        search(i + 1, newPieceLen, newNum);
      }
      counts[i] = 0;
    }
  }

  search(0, 0, 0);
  return patterns;
}

// ============================================================
// Phase 2: Branch & Bound search
// ============================================================

function branchAndBound(
  groups: BoardGroup[],
  pieceTypes: PieceType[],
): BnBSolution {
  const numTypes = pieceTypes.length;
  const totalDemand = pieceTypes.map((pt) => pt.demand);

  // Precompute suffix max-capacity for pruning
  // suffixCap[g][i] = max pieces of type i producible by groups g..end
  const suffixCap: number[][] = new Array<number[]>(groups.length + 1);
  suffixCap[groups.length] = new Array<number>(numTypes).fill(0);
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g]!;
    const maxPerType = new Array<number>(numTypes).fill(0);
    for (const p of group.patterns) {
      for (let i = 0; i < numTypes; i++) {
        maxPerType[i] = Math.max(maxPerType[i]!, p.counts[i]!);
      }
    }
    suffixCap[g] = suffixCap[g + 1]!.map(
      (s, i) => s + maxPerType[i]! * group.count,
    );
  }

  let best: BnBSolution = {
    groupAllocations: groups.map(() => []),
    unfulfilled: totalDemand.reduce((a, b) => a + b, 0),
    waste: Infinity,
    consumedCost: Infinity,
  };

  const startTime = Date.now();
  const TIMEOUT_MS = 5000;
  let timedOut = false;

  const currentAllocs: AllocEntry[][] = groups.map(() => []);
  const demand = [...totalDemand];

  function isBetter(
    unfulfilled: number,
    waste: number,
    cost: number,
  ): boolean {
    if (unfulfilled < best.unfulfilled) return true;
    if (unfulfilled > best.unfulfilled) return false;
    if (waste < best.waste - 1e-6) return true;
    if (waste > best.waste + 1e-6) return false;
    return cost < best.consumedCost - 1e-6;
  }

  function recordSolution(waste: number, cost: number): void {
    let unfulfilled = 0;
    for (let i = 0; i < numTypes; i++) {
      unfulfilled += Math.max(0, demand[i]!);
    }
    if (isBetter(unfulfilled, waste, cost)) {
      best = {
        groupAllocations: currentAllocs.map((a) => [...a]),
        unfulfilled,
        waste,
        consumedCost: cost,
      };
    }
  }

  function searchGroup(
    groupIdx: number,
    waste: number,
    cost: number,
  ): void {
    if (timedOut) return;
    if (Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
      return;
    }

    let remainingSum = 0;
    for (let i = 0; i < numTypes; i++) {
      remainingSum += Math.max(0, demand[i]!);
    }

    if (remainingSum <= 0 || groupIdx >= groups.length) {
      recordSolution(waste, cost);
      return;
    }

    // Prune: can remaining groups fulfill all demand?
    const cap = suffixCap[groupIdx]!;
    let canFulfillAll = true;
    for (let i = 0; i < numTypes; i++) {
      if (demand[i]! > cap[i]!) {
        canFulfillAll = false;
        break;
      }
    }
    if (best.unfulfilled === 0 && !canFulfillAll) return;

    // Prune: waste already >= best
    if (best.unfulfilled === 0 && waste >= best.waste - 1e-6) return;

    const group = groups[groupIdx]!;
    currentAllocs[groupIdx] = [];
    searchPattern(groupIdx, group, 0, group.count, waste, cost);
  }

  function searchPattern(
    groupIdx: number,
    group: BoardGroup,
    patternIdx: number,
    boardsLeft: number,
    waste: number,
    cost: number,
  ): void {
    if (timedOut) return;

    if (patternIdx >= group.patterns.length) {
      searchGroup(groupIdx + 1, waste, cost);
      return;
    }

    const pattern = group.patterns[patternIdx]!;

    // Max copies limited by boards and remaining demand
    let maxUse = boardsLeft;
    for (let i = 0; i < numTypes; i++) {
      const pc = pattern.counts[i]!;
      if (pc > 0) {
        maxUse = Math.min(maxUse, Math.floor(demand[i]! / pc));
      }
    }

    // Try from highest to lowest for better pruning
    for (let use = maxUse; use >= 0; use--) {
      const addedWaste = use * pattern.wasteRemainder;
      const addedCost = use * group.length * group.length;
      const newWaste = waste + addedWaste;
      const newCost = cost + addedCost;

      if (best.unfulfilled === 0 && newWaste >= best.waste - 1e-6) continue;

      // Mutate demand in place (restore after)
      for (let i = 0; i < numTypes; i++) {
        demand[i]! -= use * pattern.counts[i]!;
      }

      if (use > 0) {
        currentAllocs[groupIdx]!.push({ patternIdx, count: use });
      }

      searchPattern(
        groupIdx,
        group,
        patternIdx + 1,
        boardsLeft - use,
        newWaste,
        newCost,
      );

      if (use > 0) {
        currentAllocs[groupIdx]!.pop();
      }

      // Restore demand
      for (let i = 0; i < numTypes; i++) {
        demand[i]! += use * pattern.counts[i]!;
      }
    }
  }

  searchGroup(0, 0, 0);
  return best;
}

// ============================================================
// Result construction
// ============================================================

interface Fulfillment {
  rp: RequiredPiece;
  remaining: number;
}

function buildCutPatterns(
  solution: BnBSolution,
  groups: BoardGroup[],
  pieceTypes: PieceType[],
  requiredPieces: RequiredPiece[],
  typeName: string,
  kerf: number,
  minUsefulRemnant: number,
): { patterns: CutPattern[]; unfulfilled: UnfulfilledPiece[] } {
  const cutPatterns: CutPattern[] = [];

  // Track fulfillment per original RequiredPiece for name assignment
  const fulfillments: Fulfillment[] = requiredPieces.map((rp) => ({
    rp,
    remaining: rp.quantity,
  }));
  const fulfillmentsByLength = new Map<number, Fulfillment[]>();
  for (const f of fulfillments) {
    const list = fulfillmentsByLength.get(f.rp.length) ?? [];
    list.push(f);
    fulfillmentsByLength.set(f.rp.length, list);
  }

  function consumePieceName(length: number): string | undefined {
    const list = fulfillmentsByLength.get(length);
    if (!list) return undefined;
    for (const f of list) {
      if (f.remaining > 0) {
        f.remaining--;
        return f.rp.name;
      }
    }
    return undefined;
  }

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]!;
    const allocs = solution.groupAllocations[g] ?? [];
    let boardIdx = 0;

    for (const alloc of allocs) {
      const pattern = group.patterns[alloc.patternIdx]!;

      for (let c = 0; c < alloc.count; c++) {
        const board = group.boards[boardIdx++]!;
        const pieces: PlacedPiece[] = [];
        let offset = 0;

        for (let i = 0; i < pieceTypes.length; i++) {
          const pt = pieceTypes[i]!;
          const cnt = pattern.counts[i]!;
          for (let j = 0; j < cnt; j++) {
            if (pieces.length > 0) offset += kerf;
            const pieceName = consumePieceName(pt.length);
            const piece: PlacedPiece = {
              length: pt.length,
              startOffset: offset,
            };
            if (pieceName) piece.name = pieceName;
            pieces.push(piece);
            offset += pt.length;
          }
        }

        const totalKerf = Math.max(0, pieces.length - 1) * kerf;
        const piecesLen = pieces.reduce((s, p) => s + p.length, 0);
        const remainder = board.length - piecesLen - totalKerf;

        cutPatterns.push({
          stockBoard: board,
          pieces,
          totalKerf,
          remainder,
          remainderIsUsable: remainder >= minUsefulRemnant,
        });
      }
    }
  }

  // Build unfulfilled from remaining fulfillments
  const unfulfilled: UnfulfilledPiece[] = [];
  for (const f of fulfillments) {
    if (f.remaining > 0) {
      const uf: UnfulfilledPiece = {
        stockTypeName: typeName,
        length: f.rp.length,
        quantity: f.remaining,
        reason: 'Not enough stock available',
      };
      if (f.rp.name) uf.name = f.rp.name;
      unfulfilled.push(uf);
    }
  }

  return { patterns: cutPatterns, unfulfilled };
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
  // 1. Merge required pieces by length into PieceTypes
  const lengthMap = new Map<number, number>();
  for (const rp of requiredPieces) {
    lengthMap.set(rp.length, (lengthMap.get(rp.length) ?? 0) + rp.quantity);
  }
  const pieceTypes: PieceType[] = [...lengthMap.entries()]
    .map(([length, demand]) => ({ length, demand }))
    .sort((a, b) => b.length - a.length);

  if (pieceTypes.length === 0) {
    return { patterns: [], unfulfilled: [] };
  }

  // 2. Group boards by (length, name), sorted ascending by length
  const groupMap = new Map<string, BoardGroup>();
  for (const board of boards) {
    const key = `${String(board.length)}|${board.name ?? ''}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
      existing.boards.push(board);
    } else {
      const group: BoardGroup = {
        length: board.length,
        count: 1,
        boards: [board],
        patterns: [],
      };
      if (board.name) group.name = board.name;
      groupMap.set(key, group);
    }
  }
  const groups = [...groupMap.values()].sort((a, b) => a.length - b.length);

  // 3. Enumerate patterns per group
  for (const group of groups) {
    group.patterns = enumeratePatterns(
      group.length,
      pieceTypes,
      kerf,
      minUsefulRemnant,
    );
    // Sort: most pieces first for better B&B pruning
    group.patterns.sort((a, b) => b.numPieces - a.numPieces);
  }

  // 4. Branch & Bound
  const solution = branchAndBound(groups, pieceTypes);

  // 5. Build output
  return buildCutPatterns(
    solution,
    groups,
    pieceTypes,
    requiredPieces,
    typeName,
    kerf,
    minUsefulRemnant,
  );
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
