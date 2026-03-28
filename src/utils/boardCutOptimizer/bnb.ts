import type {
  BnBOptions,
  BnBProgress,
  BnBStats,
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  DemandItem,
  OpenBoard,
  RequiredPiece,
  ScoringParams,
  StockBoard,
  UnfulfilledPiece,
} from './types';
import { buildCutPatterns, computeSummary } from './buildOutput';
import { scoreSolution } from './scoring';

// ============================================================
// Demand expansion
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

  demandItems.sort((a, b) => b.length - a.length);
  return { demandItems, unfulfilled };
}

// ============================================================
// FFD for warm start
// ============================================================

function ffdWarmStart(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): OpenBoard[] {
  const openBoards: OpenBoard[] = [];
  const unopened = [...boards].sort((a, b) => a.length - b.length);

  for (const item of demandItems) {
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
      const board = openBoards[bestIdx]!;
      const betweenKerf = board.pieces.length > 0 ? kerf : 0;
      board.pieces.push(item);
      board.usedLength += betweenKerf + item.length;
      board.remainingCapacity = board.stockBoard.length - board.usedLength;
      continue;
    }

    for (let i = 0; i < unopened.length; i++) {
      const sb = unopened[i]!;
      if (item.length <= sb.length + 1e-9) {
        const newBoard: OpenBoard = {
          stockBoard: sb,
          pieces: [item],
          usedLength: item.length,
          remainingCapacity: sb.length - item.length,
        };
        openBoards.push(newBoard);
        unopened.splice(i, 1);
        break;
      }
    }
  }

  return openBoards;
}

// ============================================================
// Mutable board for zero-alloc recursive DFS
// ============================================================

interface MutableBoard {
  boardIndex: number;
  pieceCount: number;
  totalPieceLength: number;
  pieces: DemandItem[]; // push/pop only — no cloning during search
}

function boardRemainingCapacity(
  board: MutableBoard,
  boardLength: number,
  kerf: number,
): number {
  const interKerf = board.pieceCount > 0 ? (board.pieceCount - 1) * kerf : 0;
  return boardLength - board.totalPieceLength - interKerf;
}

// ============================================================
// Saved solution snapshot (only allocated when finding new best)
// ============================================================

interface SavedBoard {
  boardIndex: number;
  pieces: DemandItem[];
  totalPieceLength: number;
  pieceCount: number;
}

function captureSolution(openBoards: MutableBoard[]): SavedBoard[] {
  return openBoards.map((b) => ({
    boardIndex: b.boardIndex,
    pieces: [...b.pieces],
    totalPieceLength: b.totalPieceLength,
    pieceCount: b.pieceCount,
  }));
}

// ============================================================
// Piece identity for symmetry breaking
// ============================================================

function arePiecesIdentical(a: DemandItem, b: DemandItem): boolean {
  return (
    Math.abs(a.length - b.length) < 1e-9 && (a.name ?? '') === (b.name ?? '')
  );
}

const CANCEL_CHECK_INTERVAL = 4096;

// ============================================================
// Per-type B&B solver — recursive DFS with undo
// ============================================================

function solveTypeBnB(
  _typeName: string,
  boards: StockBoard[],
  demandItems: DemandItem[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  timeLimitMs: number,
  onProgress: (progress: BnBProgress) => void,
): {
  patterns: CutPattern[];
  unfulfilled: UnfulfilledPiece[];
  stats: { nodesExplored: number; nodesPruned: number; exhaustive: boolean };
} {
  if (demandItems.length === 0) {
    return {
      patterns: [],
      unfulfilled: [],
      stats: { nodesExplored: 0, nodesPruned: 0, exhaustive: true },
    };
  }

  // --- Warm start with FFD ---
  const ffdBoards = ffdWarmStart(demandItems, boards, kerf);
  const ffdPatterns = buildCutPatterns(ffdBoards, kerf, minUsefulRemnant);
  let bestScore = scoreSolution(ffdPatterns, boards, minUsefulRemnant, params);
  let bestSolution: SavedBoard[] = ffdBoards.map((ob) => {
    const idx = boards.findIndex((b) => b.id === ob.stockBoard.id);
    return {
      boardIndex: idx,
      pieces: [...ob.pieces],
      totalPieceLength: ob.pieces.reduce((s, p) => s + p.length, 0),
      pieceCount: ob.pieces.length,
    };
  });

  // Short-circuit: zero waste means FFD is optimal
  const ffdWaste = ffdPatterns.reduce(
    (sum, p) => sum + (p.remainderIsUsable ? 0 : p.remainder),
    0,
  );
  if (ffdWaste < 1e-9) {
    return {
      patterns: ffdPatterns,
      unfulfilled: [],
      stats: { nodesExplored: 0, nodesPruned: 0, exhaustive: true },
    };
  }

  // --- Precomputation ---

  const maxBoardLength = boards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );

  // Suffix sums: remainingSuffix[i] = sum of demandItems[i..end].length
  const remainingSuffix = new Float64Array(demandItems.length + 1);
  for (let i = demandItems.length - 1; i >= 0; i--) {
    remainingSuffix[i] = remainingSuffix[i + 1]! + demandItems[i]!.length;
  }

  // Per-board unused score contribution (precomputed)
  const boardUnusedContrib = new Float64Array(boards.length);
  let baseUnusedScore = 0;
  for (let i = 0; i < boards.length; i++) {
    const b = boards[i]!;
    if (b.length >= minUsefulRemnant) {
      boardUnusedContrib[i] =
        -params.leftoverBonus *
        Math.pow(b.length / maxBoardLength, params.leftoverPower);
    } else {
      boardUnusedContrib[i] = params.wastePenalty * b.length;
    }
    baseUnusedScore += boardUnusedContrib[i]!;
  }

  // Boards sorted by length descending (for lower bound: greedy cover)
  const boardsByLenDesc: number[] = [];
  for (let i = 0; i < boards.length; i++) boardsByLenDesc.push(i);
  boardsByLenDesc.sort((a, b) => boards[b]!.length - boards[a]!.length);

  // Unique board lengths sorted ascending (for opening new boards)
  const uniqueByLength = new Map<number, number[]>();
  for (let i = 0; i < boards.length; i++) {
    const len = boards[i]!.length;
    const arr = uniqueByLength.get(len) ?? [];
    arr.push(i);
    uniqueByLength.set(len, arr);
  }
  const boardLengthsAsc = [...uniqueByLength.keys()].sort((a, b) => a - b);

  // --- Mutable search state ---

  const openBoards: MutableBoard[] = [];
  const usedMask = new Uint8Array(boards.length);
  let currentUnusedScore = baseUnusedScore;
  let nodesExplored = 0;
  let nodesPruned = 0;
  let cancelled = false;
  const startTime = performance.now();
  let lastProgressTime = startTime;
  const PROGRESS_INTERVAL_MS = 500; // Throttle progress to max 2/sec

  // --- Inline leaf scoring (zero allocation) ---

  function scoreLeaf(): number {
    let score = params.boardUsePenalty * openBoards.length;
    score += currentUnusedScore;

    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const boardLen = boards[board.boardIndex]!.length;
      const n = board.pieceCount;
      const pLen = board.totalPieceLength;
      const betweenKerf = Math.max(0, n - 1) * kerf;
      const rawRem = boardLen - pLen - betweenKerf;
      const trailKerf = rawRem >= kerf ? kerf : 0;
      const remainder = boardLen - pLen - betweenKerf - trailKerf;

      if (remainder >= minUsefulRemnant) {
        score -=
          params.leftoverBonus *
          Math.pow(remainder / maxBoardLength, params.leftoverPower);
      } else {
        score += params.wastePenalty * remainder;
      }
    }

    return score;
  }

  // --- Lower bound (zero allocation) ---

  function lowerBound(pieceIdx: number): number {
    let lb = params.boardUsePenalty * openBoards.length;
    lb += currentUnusedScore;

    const totalRemaining = remainingSuffix[pieceIdx]!;
    if (totalRemaining === 0) return lb;

    // Available capacity in open boards (optimistic: one kerf per existing board)
    let availableInOpen = 0;
    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const boardLen = boards[board.boardIndex]!.length;
      const cap = boardRemainingCapacity(board, boardLen, kerf);
      // Next piece placed here costs one kerf if board has pieces
      const nextKerf = board.pieceCount > 0 ? kerf : 0;
      availableInOpen += Math.max(0, cap - nextKerf);
    }

    const unplaced = totalRemaining - availableInOpen;
    if (unplaced <= 0) return lb;

    // Greedy cover with unused boards (pre-sorted largest first)
    let covered = 0;
    for (let i = 0; i < boardsByLenDesc.length; i++) {
      if (covered >= unplaced) break;
      const bi = boardsByLenDesc[i]!;
      if (usedMask[bi]) continue;
      covered += Math.max(0, boards[bi]!.length - kerf);
      // This board transitions from unused to used
      lb -= boardUnusedContrib[bi]!;
      lb += params.boardUsePenalty;
    }

    if (covered < unplaced) return Infinity;
    return lb;
  }

  // --- Recursive DFS with undo ---

  function recurse(pieceIdx: number, prevBoardChoice: number): void {
    nodesExplored++;

    if (nodesExplored % CANCEL_CHECK_INTERVAL === 0) {
      const now = performance.now();
      const elapsed = now - startTime;
      if (elapsed > timeLimitMs) {
        cancelled = true;
        return;
      }
      if (now - lastProgressTime >= PROGRESS_INTERVAL_MS) {
        lastProgressTime = now;
        onProgress({
          elapsedMs: elapsed,
          nodesExplored,
          bestScore,
          boardsUsedInBest: bestSolution.length,
          improved: false,
        });
      }
    }

    // Leaf: all pieces placed
    if (pieceIdx >= demandItems.length) {
      const score = scoreLeaf();
      if (score < bestScore - 1e-9) {
        bestScore = score;
        bestSolution = captureSolution(openBoards);
        // Throttle improvement messages too
        const now = performance.now();
        if (now - lastProgressTime >= PROGRESS_INTERVAL_MS) {
          lastProgressTime = now;
          onProgress({
            elapsedMs: now - startTime,
            nodesExplored,
            bestScore,
            boardsUsedInBest: bestSolution.length,
            improved: true,
          });
        }
      }
      return;
    }

    // Lower bound pruning
    const lb = lowerBound(pieceIdx);
    if (lb >= bestScore - 1e-9) {
      nodesPruned++;
      return;
    }

    const piece = demandItems[pieceIdx]!;
    const prevPiece =
      pieceIdx > 0 ? demandItems[pieceIdx - 1] : undefined;
    const isIdenticalToPrev =
      prevPiece !== undefined && arePiecesIdentical(piece, prevPiece);
    const minChoice = isIdenticalToPrev ? prevBoardChoice : 0;

    // --- Branch 1: place on existing open board ---
    // Find best-fit board first (try it first for better pruning)
    let bestFitIdx = -1;
    let bestFitRemaining = Infinity;
    for (let i = minChoice; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const boardLen = boards[board.boardIndex]!.length;
      const kerfNeeded = board.pieceCount > 0 ? kerf : 0;
      const cap = boardRemainingCapacity(board, boardLen, kerf);
      const spaceNeeded = piece.length + kerfNeeded;
      if (spaceNeeded <= cap + 1e-9) {
        const remAfter = cap - spaceNeeded;
        if (remAfter < bestFitRemaining) {
          bestFitRemaining = remAfter;
          bestFitIdx = i;
        }
      }
    }

    // Try best-fit first
    if (bestFitIdx >= 0) {
      const board = openBoards[bestFitIdx]!;
      board.pieces.push(piece);
      board.pieceCount++;
      board.totalPieceLength += piece.length;

      recurse(pieceIdx + 1, bestFitIdx);

      board.pieces.pop();
      board.pieceCount--;
      board.totalPieceLength -= piece.length;
      if (cancelled) return;
    }

    // Try other open boards
    for (let i = minChoice; i < openBoards.length; i++) {
      if (i === bestFitIdx) continue;
      const board = openBoards[i]!;
      const boardLen = boards[board.boardIndex]!.length;
      const kerfNeeded = board.pieceCount > 0 ? kerf : 0;
      const cap = boardRemainingCapacity(board, boardLen, kerf);
      if (piece.length + kerfNeeded <= cap + 1e-9) {
        board.pieces.push(piece);
        board.pieceCount++;
        board.totalPieceLength += piece.length;

        recurse(pieceIdx + 1, i);

        board.pieces.pop();
        board.pieceCount--;
        board.totalPieceLength -= piece.length;
        if (cancelled) return;
      }
    }

    // --- Branch 2: open a new board ---
    const newOpenIdx = openBoards.length;
    const newBoardMinChoice = isIdenticalToPrev ? prevBoardChoice : newOpenIdx;
    if (newOpenIdx < newBoardMinChoice) return;

    for (let li = 0; li < boardLengthsAsc.length; li++) {
      const len = boardLengthsAsc[li]!;
      if (piece.length > len + 1e-9) continue;

      const candidates = uniqueByLength.get(len)!;
      let boardIdx = -1;
      for (let ci = 0; ci < candidates.length; ci++) {
        if (!usedMask[candidates[ci]!]) {
          boardIdx = candidates[ci]!;
          break;
        }
      }
      if (boardIdx === -1) continue;

      // Open board (mutate)
      const newBoard: MutableBoard = {
        boardIndex: boardIdx,
        pieceCount: 1,
        totalPieceLength: piece.length,
        pieces: [piece],
      };
      openBoards.push(newBoard);
      usedMask[boardIdx] = 1;
      currentUnusedScore -= boardUnusedContrib[boardIdx]!;

      recurse(pieceIdx + 1, newOpenIdx);

      // Undo
      openBoards.pop();
      usedMask[boardIdx] = 0;
      currentUnusedScore += boardUnusedContrib[boardIdx]!;
      if (cancelled) return;
    }
  }

  // --- Kick off search ---
  recurse(0, 0);

  // --- Build final result from best solution ---
  const finalOpenBoards: OpenBoard[] = bestSolution.map((s) => ({
    stockBoard: boards[s.boardIndex]!,
    pieces: [...s.pieces],
    usedLength:
      s.totalPieceLength + Math.max(0, s.pieceCount - 1) * kerf,
    remainingCapacity:
      boards[s.boardIndex]!.length -
      s.totalPieceLength -
      Math.max(0, s.pieceCount - 1) * kerf,
  }));
  const patterns = buildCutPatterns(finalOpenBoards, kerf, minUsefulRemnant);

  return {
    patterns,
    unfulfilled: [],
    stats: {
      nodesExplored,
      nodesPruned,
      exhaustive: !cancelled,
    },
  };
}

// ============================================================
// Main entry point
// ============================================================

export function optimizeCutsBnB(
  input: CutOptimizerInput,
  options: BnBOptions,
  onProgress: (progress: BnBProgress) => void,
): { result: CutOptimizerResult; stats: BnBStats } {
  const { kerf, minUsefulRemnant } = input;
  const { scoringParams, timeLimitMs } = options;

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

  let totalDemandCount = 0;
  const demandCountByType = new Map<string, number>();
  for (const [typeName, pieces] of piecesByType) {
    const count = pieces.reduce((s, p) => s + p.quantity, 0);
    demandCountByType.set(typeName, count);
    totalDemandCount += count;
  }

  const patternsByType: Record<string, CutPattern[]> = {};
  const allUnfulfilled: UnfulfilledPiece[] = [];
  let totalNodesExplored = 0;
  let totalNodesPruned = 0;
  let exhaustive = true;
  const startTime = performance.now();

  for (const [typeName, pieces] of piecesByType) {
    const boards = boardsByType.get(typeName) ?? [];

    const maxBoardLength = boards.reduce(
      (max, b) => Math.max(max, b.length),
      0,
    );

    const { demandItems, unfulfilled: earlyUnfulfilled } = expandDemand(
      pieces,
      maxBoardLength,
      typeName,
    );

    allUnfulfilled.push(...earlyUnfulfilled);
    if (demandItems.length === 0) continue;

    const typeDemandCount = demandCountByType.get(typeName) ?? 1;
    const typeTimeBudget =
      totalDemandCount > 0
        ? timeLimitMs * (typeDemandCount / totalDemandCount)
        : timeLimitMs;

    const result = solveTypeBnB(
      typeName,
      boards,
      demandItems,
      kerf,
      minUsefulRemnant,
      scoringParams,
      typeTimeBudget,
      onProgress,
    );

    if (result.patterns.length > 0) {
      patternsByType[typeName] = result.patterns;
    }
    allUnfulfilled.push(...result.unfulfilled);
    totalNodesExplored += result.stats.nodesExplored;
    totalNodesPruned += result.stats.nodesPruned;
    if (!result.stats.exhaustive) exhaustive = false;
  }

  return {
    result: {
      patternsByType,
      unfulfilled: allUnfulfilled,
      summary: computeSummary(
        patternsByType,
        input.stockTypes,
        minUsefulRemnant,
      ),
    },
    stats: {
      totalNodesExplored,
      totalNodesPruned,
      totalElapsedMs: performance.now() - startTime,
      exhaustive,
    },
  };
}
