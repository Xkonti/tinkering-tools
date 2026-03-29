import type {
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  PlacedPiece,
  RequiredPiece,
  ScoringParams,
  StockBoard,
  UnfulfilledPiece,
} from './types';
import { computeSummary } from './buildOutput';
import { optimizeCuts } from './ffd';

// ============================================================
// Types for ILP internals
// ============================================================

interface DemandGroup {
  length: number;
  name: string | undefined;
  demand: number;
}

interface BoardTypeGroup {
  length: number;
  supply: number;
  boardIds: string[];
}

interface Pattern {
  counts: number[];
  totalPieceLength: number;
  pieceCount: number;
}

// Highs solver type — minimal interface for what we use.
// The actual highs package returns a union type; we cast after checking Status.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Highs = { solve: (problem: string, options?: Record<string, unknown>) => any };

const MAX_PATTERNS = 50_000;

// ============================================================
// Demand grouping
// ============================================================

function groupDemand(
  requiredPieces: RequiredPiece[],
  typeName: string,
): { groups: DemandGroup[]; unfulfilled: UnfulfilledPiece[] } {
  const groups: DemandGroup[] = [];
  const unfulfilled: UnfulfilledPiece[] = [];
  const keyMap = new Map<string, number>();

  for (const rp of requiredPieces) {
    if (rp.stockTypeName !== typeName) continue;
    const key = `${rp.length}|${rp.name ?? ''}`;
    const idx = keyMap.get(key);
    if (idx !== undefined) {
      groups[idx]!.demand += rp.quantity;
    } else {
      keyMap.set(key, groups.length);
      groups.push({
        length: rp.length,
        name: rp.name,
        demand: rp.quantity,
      });
    }
  }

  // Sort longest first for better enumeration pruning
  groups.sort((a, b) => b.length - a.length);
  return { groups, unfulfilled };
}

// ============================================================
// Board type grouping
// ============================================================

function groupBoardTypes(boards: StockBoard[]): BoardTypeGroup[] {
  const byLength = new Map<number, BoardTypeGroup>();
  for (const b of boards) {
    const existing = byLength.get(b.length);
    if (existing) {
      existing.supply++;
      existing.boardIds.push(b.id);
    } else {
      byLength.set(b.length, {
        length: b.length,
        supply: 1,
        boardIds: [b.id],
      });
    }
  }
  // Sort ascending by length (offcuts first)
  return [...byLength.values()].sort((a, b) => a.length - b.length);
}

// ============================================================
// Pattern enumeration (recursive, demand-bounded)
// ============================================================

function enumeratePatterns(
  boardLength: number,
  groups: DemandGroup[],
  kerf: number,
): Pattern[] {
  const patterns: Pattern[] = [];
  const counts = new Array<number>(groups.length).fill(0);
  let aborted = false;

  function recurse(
    groupIdx: number,
    usedLength: number,
    pieceCount: number,
  ): void {
    if (aborted) return;

    // Record pattern if we have at least 1 piece
    if (pieceCount > 0) {
      if (patterns.length >= MAX_PATTERNS) {
        aborted = true;
        return;
      }
      patterns.push({
        counts: [...counts],
        totalPieceLength: usedLength - Math.max(0, pieceCount - 1) * kerf,
        pieceCount,
      });
    }

    if (groupIdx >= groups.length) return;

    const group = groups[groupIdx]!;
    const pLen = group.length;

    // Try adding 0..maxFit of this group
    // First recurse with 0 (skip this group)
    recurse(groupIdx + 1, usedLength, pieceCount);

    // Then try 1, 2, ... of this group
    for (let c = 1; c <= group.demand; c++) {
      const addedKerf = pieceCount > 0 || c > 1 ? kerf : 0;
      const newUsed = usedLength + pLen + addedKerf;
      if (newUsed > boardLength + 1e-9) break;

      counts[groupIdx] = c;
      // Recompute from scratch to avoid floating-point drift
      let totalUsed = 0;
      for (let i = 0; i <= groupIdx; i++) {
        totalUsed += counts[i]! * groups[i]!.length;
      }
      const totalPieces = counts.reduce(
        (s, v, i) => (i <= groupIdx ? s + v : s),
        0,
      );
      const totalWithKerf =
        totalUsed + Math.max(0, totalPieces - 1) * kerf;

      if (totalWithKerf > boardLength + 1e-9) break;

      recurse(groupIdx + 1, totalWithKerf, totalPieces);
    }

    // Reset count for backtrack
    counts[groupIdx] = 0;
  }

  recurse(0, 0, 0);
  return patterns;
}

// ============================================================
// Pattern scoring
// ============================================================

function computePatternDelta(
  pattern: Pattern,
  boardLength: number,
  kerf: number,
  minUsefulRemnant: number,
  maxBoardLength: number,
  params: ScoringParams,
): number {
  const betweenKerf = Math.max(0, pattern.pieceCount - 1) * kerf;
  const rawRem = boardLength - pattern.totalPieceLength - betweenKerf;
  const trailKerf = rawRem >= kerf ? kerf : 0;
  const remainder = rawRem - trailKerf;

  let usedScore = params.boardUsePenalty;
  if (remainder >= minUsefulRemnant) {
    usedScore -=
      params.leftoverBonus *
      Math.pow(remainder / maxBoardLength, params.leftoverPower);
  } else {
    usedScore +=
      params.wastePenalty *
      remainder *
      Math.pow(remainder / maxBoardLength, params.wastePower - 1);
  }

  // Unused boards contribute 0, so delta = usedScore
  return usedScore;
}

// ============================================================
// LP model builder (CPLEX LP format)
// ============================================================

function buildLpModel(
  patternsPerType: { patterns: Pattern[]; boardTypeIdx: number }[],
  groups: DemandGroup[],
  boardTypes: BoardTypeGroup[],
  deltas: number[][],
): { lpString: string; varCount: number } {
  const lines: string[] = [];
  let varIdx = 0;

  // Map: flat variable index → (boardTypeBlockIdx, patternIdx)
  const varMap: { blockIdx: number; patternIdx: number }[] = [];

  // Build objective
  lines.push('Minimize');
  const objTerms: string[] = [];
  for (let bi = 0; bi < patternsPerType.length; bi++) {
    const block = patternsPerType[bi]!;
    const blockDeltas = deltas[bi]!;
    for (let pi = 0; pi < block.patterns.length; pi++) {
      const delta = blockDeltas[pi]!;
      const vName = `x${varIdx}`;
      varMap.push({ blockIdx: bi, patternIdx: pi });

      if (Math.abs(delta) > 1e-12) {
        if (delta > 0) {
          objTerms.push(
            `${objTerms.length === 0 ? '' : '+ '}${delta} ${vName}`,
          );
        } else {
          objTerms.push(`- ${Math.abs(delta)} ${vName}`);
        }
      }
      varIdx++;
    }
  }
  if (objTerms.length === 0) objTerms.push('0 x0');
  lines.push(` obj: ${objTerms.join(' ')}`);

  // Demand constraints
  lines.push('Subject To');
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]!;
    const terms: string[] = [];
    for (let vi = 0; vi < varMap.length; vi++) {
      const { blockIdx, patternIdx } = varMap[vi]!;
      const count =
        patternsPerType[blockIdx]!.patterns[patternIdx]!.counts[gi]!;
      if (count > 0) {
        terms.push(
          `${terms.length === 0 ? '' : '+ '}${count} x${vi}`,
        );
      }
    }
    if (terms.length > 0) {
      lines.push(` demand_${gi}: ${terms.join(' ')} = ${group.demand}`);
    }
  }

  // Supply constraints
  for (let bti = 0; bti < boardTypes.length; bti++) {
    const bt = boardTypes[bti]!;
    const terms: string[] = [];
    for (let vi = 0; vi < varMap.length; vi++) {
      const { blockIdx } = varMap[vi]!;
      if (patternsPerType[blockIdx]!.boardTypeIdx === bti) {
        terms.push(
          `${terms.length === 0 ? '' : '+ '}x${vi}`,
        );
      }
    }
    if (terms.length > 0) {
      lines.push(
        ` supply_${bti}: ${terms.join(' ')} <= ${bt.supply}`,
      );
    }
  }

  // Bounds (all >= 0 by default in LP format, but be explicit)
  lines.push('Bounds');
  for (let vi = 0; vi < varIdx; vi++) {
    lines.push(` x${vi} >= 0`);
  }

  // Integer variables
  lines.push('Generals');
  const generals: string[] = [];
  for (let vi = 0; vi < varIdx; vi++) {
    generals.push(`x${vi}`);
  }
  lines.push(` ${generals.join(' ')}`);

  lines.push('End');
  return { lpString: lines.join('\n'), varCount: varIdx };
}

// ============================================================
// Solution extraction
// ============================================================

function extractSolution(
  solution: {
    Columns: Record<
      string,
      { Primal: number; Name: string; Index: number }
    >;
  },
  patternsPerType: { patterns: Pattern[]; boardTypeIdx: number }[],
  boardTypes: BoardTypeGroup[],
  allBoards: StockBoard[],
  groups: DemandGroup[],
  kerf: number,
  minUsefulRemnant: number,
): CutPattern[] {
  const cutPatterns: CutPattern[] = [];

  // Track which boards have been assigned
  const usedBoardIds = new Set<string>();
  // Track available boards per type
  const availableByType: string[][] = boardTypes.map((bt) => [...bt.boardIds]);

  let varIdx = 0;
  for (let bi = 0; bi < patternsPerType.length; bi++) {
    const block = patternsPerType[bi]!;
    const bti = block.boardTypeIdx;
    const boardLength = boardTypes[bti]!.length;

    for (let pi = 0; pi < block.patterns.length; pi++) {
      const vName = `x${varIdx}`;
      varIdx++;

      const col = solution.Columns[vName];
      if (!col) continue;
      const count = Math.round(col.Primal);
      if (count <= 0) continue;

      const pattern = block.patterns[pi]!;

      // Create 'count' boards with this pattern
      for (let c = 0; c < count; c++) {
        // Pick a board from available
        const available = availableByType[bti]!;
        if (available.length === 0) continue;
        const boardId = available.pop()!;
        usedBoardIds.add(boardId);
        const stockBoard = allBoards.find((b) => b.id === boardId)!;

        // Build placed pieces with offsets
        const pieces: PlacedPiece[] = [];
        let offset = 0;
        for (let gi = 0; gi < groups.length; gi++) {
          const gc = pattern.counts[gi]!;
          const group = groups[gi]!;
          for (let k = 0; k < gc; k++) {
            if (pieces.length > 0) offset += kerf;
            const piece: PlacedPiece = {
              length: group.length,
              startOffset: offset,
            };
            if (group.name) piece.name = group.name;
            pieces.push(piece);
            offset += group.length;
          }
        }

        // Compute kerf and remainder
        const betweenKerf =
          Math.max(0, pattern.pieceCount - 1) * kerf;
        const rawRem =
          boardLength - pattern.totalPieceLength - betweenKerf;
        const trailKerf = rawRem >= kerf ? kerf : 0;
        const remainder = rawRem - trailKerf;
        const totalKerf = betweenKerf + trailKerf;

        cutPatterns.push({
          stockBoard,
          pieces,
          totalKerf,
          remainder,
          remainderIsUsable: remainder >= minUsefulRemnant,
        });
      }
    }
  }

  return cutPatterns;
}

// ============================================================
// Per-type ILP solver
// ============================================================

function solveTypeIlp(
  boards: StockBoard[],
  requiredPieces: RequiredPiece[],
  typeName: string,
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  highs: Highs,
): { patterns: CutPattern[]; unfulfilled: UnfulfilledPiece[] } {
  // Group demand and board types
  const { groups } = groupDemand(requiredPieces, typeName);
  if (groups.length === 0) return { patterns: [], unfulfilled: [] };

  const boardTypes = groupBoardTypes(boards);
  if (boardTypes.length === 0) return { patterns: [], unfulfilled: [] };

  const maxBoardLength = boards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );

  // Filter out pieces too long for any board
  const unfulfilled: UnfulfilledPiece[] = [];
  const validGroups: DemandGroup[] = [];
  for (const g of groups) {
    if (g.length > maxBoardLength + 1e-9) {
      const uf: UnfulfilledPiece = {
        stockTypeName: typeName,
        length: g.length,
        quantity: g.demand,
        reason: 'No board long enough for this piece',
      };
      if (g.name) uf.name = g.name;
      unfulfilled.push(uf);
    } else {
      validGroups.push(g);
    }
  }

  if (validGroups.length === 0) {
    return { patterns: [], unfulfilled };
  }

  // Enumerate patterns per board type
  const patternsPerType: { patterns: Pattern[]; boardTypeIdx: number }[] =
    [];
  const deltas: number[][] = [];

  for (let bti = 0; bti < boardTypes.length; bti++) {
    const bt = boardTypes[bti]!;
    const btPatterns = enumeratePatterns(
      bt.length,
      validGroups,
      kerf,
    );

    if (btPatterns.length === 0) continue;

    // Compute costs per pattern
    const btDeltas = btPatterns.map((p) =>
      computePatternDelta(
        p,
        bt.length,
        kerf,
        minUsefulRemnant,
        maxBoardLength,
        params,
      ),
    );

    patternsPerType.push({ patterns: btPatterns, boardTypeIdx: bti });
    deltas.push(btDeltas);
  }

  if (patternsPerType.length === 0) {
    return { patterns: [], unfulfilled };
  }

  // Build and solve ILP
  const { lpString } = buildLpModel(
    patternsPerType,
    validGroups,
    boardTypes,
    deltas,
  );

  let solution;
  try {
    solution = highs.solve(lpString, {
      time_limit: 60,
      mip_abs_gap: 1e-6,
      mip_rel_gap: 1e-4,
    });
  } catch {
    return { patterns: [], unfulfilled };
  }

  if (
    solution.Status !== 'Optimal' &&
    solution.Status !== 'Time limit reached' &&
    solution.Status !== 'Target for objective reached'
  ) {
    // Fall back to FFD for this type
    return { patterns: [], unfulfilled };
  }

  // Extract solution
  const cutPatterns = extractSolution(
    solution,
    patternsPerType,
    boardTypes,
    boards,
    validGroups,
    kerf,
    minUsefulRemnant,
  );

  return { patterns: cutPatterns, unfulfilled };
}

// ============================================================
// Main entry point
// ============================================================

export function optimizeCutsIlp(
  input: CutOptimizerInput,
  scoringParams: ScoringParams,
  highs: Highs,
): CutOptimizerResult {
  const { kerf, minUsefulRemnant } = input;

  // Group required pieces by stock type
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

  const patternsByType: Record<string, CutPattern[]> = {};
  const allUnfulfilled: UnfulfilledPiece[] = [];

  for (const [typeName, pieces] of piecesByType) {
    const boards = boardsByType.get(typeName) ?? [];

    let result: {
      patterns: CutPattern[];
      unfulfilled: UnfulfilledPiece[];
    };

    try {
      result = solveTypeIlp(
        boards,
        pieces,
        typeName,
        kerf,
        minUsefulRemnant,
        scoringParams,
        highs,
      );
    } catch {
      // ILP failed — fall back to FFD
      const ffdResult = optimizeCuts(input);
      return ffdResult;
    }

    if (result.patterns.length > 0) {
      patternsByType[typeName] = result.patterns;
    }
    allUnfulfilled.push(...result.unfulfilled);
  }

  return {
    patternsByType,
    unfulfilled: allUnfulfilled,
    summary: computeSummary(
      patternsByType,
      input.stockTypes,
      minUsefulRemnant,
    ),
  };
}
