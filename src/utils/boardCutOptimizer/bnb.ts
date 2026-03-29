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
import { computeSeed, expandDemand, ffdPlace, mulberry32 } from './shared';

// ============================================================
// FFD warm start (thin wrapper over shared ffdPlace)
// ============================================================

function ffdWarmStart(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
): OpenBoard[] {
  return ffdPlace(demandItems, boards, kerf).openBoards;
}

// ============================================================
// Score OpenBoard[] directly (avoids CutPattern allocation)
// ============================================================

function scoreOpenBoardsDirect(
  openBoards: OpenBoard[],
  kerf: number,
  minUsefulRemnant: number,
  maxBoardLength: number,
  boardUsePenalty: number,
  wastePenalty: number,
  leftoverBonus: number,
  powFn: (x: number) => number,
  wasteVal: (len: number) => number,
): number {
  let score = 0;

  for (let i = 0; i < openBoards.length; i++) {
    const ob = openBoards[i]!;
    // Proportional board penalty (0 for scrap boards)
    if (ob.stockBoard.length >= minUsefulRemnant) {
      score += boardUsePenalty * (ob.stockBoard.length / maxBoardLength);
    }
    const n = ob.pieces.length;
    const pLen = ob.pieces.reduce((s, p) => s + p.length, 0);
    const betweenKerf = Math.max(0, n - 1) * kerf;
    const rawRem = ob.stockBoard.length - pLen - betweenKerf;
    const trailKerf = rawRem >= kerf ? kerf : 0;
    const remainder = ob.stockBoard.length - pLen - betweenKerf - trailKerf;

    if (remainder >= minUsefulRemnant) {
      score -= leftoverBonus * powFn(remainder / maxBoardLength);
    } else {
      score += wastePenalty * wasteVal(remainder);
    }
  }

  return score;
}

// ============================================================
// Multi-start FFD warm start (deterministic via seeded PRNG)
// ============================================================

function multiStartFFD(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  numStarts: number,
): { bestBoards: OpenBoard[]; bestScore: number } {
  const { boardUsePenalty, wastePenalty, leftoverBonus } = params;
  const maxBoardLength = boards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );
  const power = params.leftoverPower;
  const powFn: (x: number) => number =
    power === 0.5
      ? Math.sqrt
      : power === 1.0
        ? (x: number) => x
        : power === 1.5
          ? (x: number) => x * Math.sqrt(x)
          : power === 2.0
            ? (x: number) => x * x
            : (x: number) => Math.pow(x, power);

  const wp = params.wastePower;
  const wasteVal: (len: number) => number =
    wp === 1.0
      ? (len: number) => len
      : (len: number) =>
          len * Math.pow(len / maxBoardLength, wp - 1);

  // Standard longest-first FFD
  let bestBoards = ffdWarmStart(demandItems, boards, kerf);
  let bestScore = scoreOpenBoardsDirect(
    bestBoards, kerf, minUsefulRemnant, maxBoardLength,
    boardUsePenalty, wastePenalty, leftoverBonus, powFn, wasteVal,
  );

  // Deterministic shuffled orderings
  const seed = computeSeed(demandItems, boards, kerf);
  const rng = mulberry32(seed);

  for (let s = 0; s < numStarts; s++) {
    const shuffled = [...demandItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const trialBoards = ffdWarmStart(shuffled, boards, kerf);
    const trialScore = scoreOpenBoardsDirect(
      trialBoards, kerf, minUsefulRemnant, maxBoardLength,
      boardUsePenalty, wastePenalty, leftoverBonus, powFn, wasteVal,
    );
    if (trialScore < bestScore - 1e-9) {
      bestScore = trialScore;
      bestBoards = trialBoards;
    }
  }

  return { bestBoards, bestScore };
}

// ============================================================
// Local search post-processing (delta scoring)
// ============================================================

interface LSBoard {
  boardIndex: number;
  pieces: DemandItem[];
  totalPieceLength: number;
}

function boardCapacity(
  board: LSBoard,
  boardLen: number,
  kerf: number,
): number {
  const interKerf =
    board.pieces.length > 0 ? (board.pieces.length - 1) * kerf : 0;
  return boardLen - board.totalPieceLength - interKerf;
}

function pieceFits(
  board: LSBoard,
  pieceLen: number,
  boardLen: number,
  kerf: number,
): boolean {
  const kerfNeeded = board.pieces.length > 0 ? kerf : 0;
  return pieceLen + kerfNeeded <= boardCapacity(board, boardLen, kerf) + 1e-9;
}

// Score contribution of a single used board (boardUsePenalty + remainder effect)
function lsBoardScore(
  board: LSBoard,
  boardLen: number,
  kerf: number,
  minUsefulRemnant: number,
  maxBoardLength: number,
  boardUsePenalty: number,
  wastePenalty: number,
  leftoverBonus: number,
  powFn: (x: number) => number,
  wasteVal: (len: number) => number,
): number {
  const n = board.pieces.length;
  if (n === 0) return 0;
  const betweenKerf = (n - 1) * kerf;
  const rawRem = boardLen - board.totalPieceLength - betweenKerf;
  const trailKerf = rawRem >= kerf ? kerf : 0;
  const remainder = boardLen - board.totalPieceLength - betweenKerf - trailKerf;
  // Proportional board penalty (0 for scrap boards)
  let score =
    boardLen >= minUsefulRemnant
      ? boardUsePenalty * (boardLen / maxBoardLength)
      : 0;
  if (remainder >= minUsefulRemnant) {
    score -= leftoverBonus * powFn(remainder / maxBoardLength);
  } else {
    score += wastePenalty * wasteVal(remainder);
  }
  return score;
}

function localSearch(
  openBoards: OpenBoard[],
  allBoards: StockBoard[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  maxPasses: number,
): OpenBoard[] {
  const { boardUsePenalty, wastePenalty, leftoverBonus } = params;
  const maxBoardLength = allBoards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );
  const power = params.leftoverPower;
  const powFn: (x: number) => number =
    power === 0.5
      ? Math.sqrt
      : power === 1.0
        ? (x: number) => x
        : power === 1.5
          ? (x: number) => x * Math.sqrt(x)
          : power === 2.0
            ? (x: number) => x * x
            : (x: number) => Math.pow(x, power);

  const wp = params.wastePower;
  const wasteVal: (len: number) => number =
    wp === 1.0
      ? (len: number) => len
      : (len: number) =>
          len * Math.pow(len / maxBoardLength, wp - 1);

  // Convert to mutable LS boards
  const lsBoards: LSBoard[] = openBoards.map((ob) => {
    const idx = allBoards.findIndex((b) => b.id === ob.stockBoard.id);
    return {
      boardIndex: idx,
      pieces: [...ob.pieces],
      totalPieceLength: ob.pieces.reduce((s, p) => s + p.length, 0),
    };
  });

  // Helper to score a single LS board
  const scoreSingle = (b: LSBoard): number =>
    lsBoardScore(
      b,
      allBoards[b.boardIndex]!.length,
      kerf,
      minUsefulRemnant,
      maxBoardLength,
      boardUsePenalty,
      wastePenalty,
      leftoverBonus,
      powFn,
      wasteVal,
    );

  // Compute initial score: only used boards contribute
  let currentScore = 0;
  for (const b of lsBoards) {
    currentScore += scoreSingle(b);
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    // Move: try relocating each piece to a different board
    for (let srcIdx = 0; srcIdx < lsBoards.length; srcIdx++) {
      const src = lsBoards[srcIdx]!;
      for (let pi = src.pieces.length - 1; pi >= 0; pi--) {
        const piece = src.pieces[pi]!;

        for (let dstIdx = 0; dstIdx < lsBoards.length; dstIdx++) {
          if (dstIdx === srcIdx) continue;
          const dst = lsBoards[dstIdx]!;
          const dstLen = allBoards[dst.boardIndex]!.length;

          if (pieceFits(dst, piece.length, dstLen, kerf)) {
            // Compute old contributions
            const oldSrcScore = scoreSingle(src);
            const oldDstScore = scoreSingle(dst);

            // Apply the move
            src.pieces.splice(pi, 1);
            src.totalPieceLength -= piece.length;
            dst.pieces.push(piece);
            dst.totalPieceLength += piece.length;

            // Compute new contributions
            const newSrcScore = src.pieces.length > 0 ? scoreSingle(src) : 0;
            const newDstScore = scoreSingle(dst);

            const newScore =
              currentScore -
              oldSrcScore -
              oldDstScore +
              newSrcScore +
              newDstScore;

            if (newScore < currentScore - 1e-9) {
              currentScore = newScore;
              improved = true;
              break;
            } else {
              // Undo
              dst.pieces.pop();
              dst.totalPieceLength -= piece.length;
              src.pieces.splice(pi, 0, piece);
              src.totalPieceLength += piece.length;
            }
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }

    if (improved) {
      // Remove empty boards before next pass
      for (let i = lsBoards.length - 1; i >= 0; i--) {
        if (lsBoards[i]!.pieces.length === 0) {
          lsBoards.splice(i, 1);
        }
      }
      continue;
    }

    // Swap: exchange pieces between boards
    for (let aIdx = 0; aIdx < lsBoards.length && !improved; aIdx++) {
      const boardA = lsBoards[aIdx]!;
      const aLen = allBoards[boardA.boardIndex]!.length;
      for (let ai = 0; ai < boardA.pieces.length && !improved; ai++) {
        const pieceA = boardA.pieces[ai]!;
        for (let bIdx = aIdx + 1; bIdx < lsBoards.length && !improved; bIdx++) {
          const boardB = lsBoards[bIdx]!;
          const bLen = allBoards[boardB.boardIndex]!.length;
          for (let bi = 0; bi < boardB.pieces.length; bi++) {
            const pieceB = boardB.pieces[bi]!;
            if (Math.abs(pieceA.length - pieceB.length) < 1e-9) continue;

            // Compute old contributions
            const oldAScore = scoreSingle(boardA);
            const oldBScore = scoreSingle(boardB);

            // Temporarily swap
            boardA.pieces[ai] = pieceB;
            boardA.totalPieceLength += pieceB.length - pieceA.length;
            boardB.pieces[bi] = pieceA;
            boardB.totalPieceLength += pieceA.length - pieceB.length;

            // Check feasibility
            const aFits = boardCapacity(boardA, aLen, kerf) >= -1e-9;
            const bFits = boardCapacity(boardB, bLen, kerf) >= -1e-9;

            if (aFits && bFits) {
              const newAScore = scoreSingle(boardA);
              const newBScore = scoreSingle(boardB);
              const newScore =
                currentScore - oldAScore - oldBScore + newAScore + newBScore;

              if (newScore < currentScore - 1e-9) {
                currentScore = newScore;
                improved = true;
                break;
              }
            }

            // Undo swap
            if (!improved) {
              boardA.pieces[ai] = pieceA;
              boardA.totalPieceLength += pieceA.length - pieceB.length;
              boardB.pieces[bi] = pieceB;
              boardB.totalPieceLength += pieceB.length - pieceA.length;
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  // Convert back to OpenBoard[], filtering empty boards
  return lsBoards
    .filter((b) => b.pieces.length > 0)
    .map((b) => {
      const sb = allBoards[b.boardIndex]!;
      const interKerf =
        b.pieces.length > 0 ? (b.pieces.length - 1) * kerf : 0;
      return {
        stockBoard: sb,
        pieces: [...b.pieces],
        usedLength: b.totalPieceLength + interKerf,
        remainingCapacity: sb.length - b.totalPieceLength - interKerf,
      };
    });
}

// ============================================================
// Mutable board for zero-alloc recursive DFS
// ============================================================

interface MutableBoard {
  boardIndex: number;
  pieceCount: number;
  totalPieceLength: number;
  cachedCapacity: number;
  pieces: DemandItem[];
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
    pieces: b.pieces.slice(0, b.pieceCount),
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
const MULTI_START_COUNT = 150;

// ============================================================
// Per-type B&B solver — recursive DFS with undo
// ============================================================

function solveTypeBnB(
  boards: StockBoard[],
  demandItems: DemandItem[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  timeLimitMs: number,
  onProgress: (progress: BnBProgress) => void,
  onIntermediatePatterns?: (patterns: CutPattern[]) => void,
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

  // --- Hoist scoring params into local constants ---
  const { boardUsePenalty, wastePenalty, leftoverBonus } = params;

  // --- Precomputation ---

  const maxBoardLength = boards.reduce(
    (max, b) => Math.max(max, b.length),
    0,
  );

  // Specialized power function (avoids Math.pow in hot loop)
  const power = params.leftoverPower;
  const powFn: (x: number) => number =
    power === 0.5
      ? Math.sqrt
      : power === 1.0
        ? (x: number) => x
        : power === 1.5
          ? (x: number) => x * Math.sqrt(x)
          : power === 2.0
            ? (x: number) => x * x
            : (x: number) => Math.pow(x, power);

  // Waste value function: wasteLen * pow(wasteLen / maxBoardLength, wastePower - 1)
  // When wastePower=1, returns wasteLen (backward compatible)
  const wp = params.wastePower;
  const wasteVal: (len: number) => number =
    wp === 1.0
      ? (len: number) => len
      : (len: number) =>
          len * Math.pow(len / maxBoardLength, wp - 1);

  // Board lengths in a flat typed array (avoids StockBoard pointer chase)
  const boardLenByIdx = new Float64Array(boards.length);
  for (let i = 0; i < boards.length; i++) {
    boardLenByIdx[i] = boards[i]!.length;
  }

  // Per-board use penalty (proportional to length, 0 for scrap boards)
  const boardPenaltyByIdx = new Float64Array(boards.length);
  for (let i = 0; i < boards.length; i++) {
    const bLen = boardLenByIdx[i]!;
    boardPenaltyByIdx[i] =
      bLen >= minUsefulRemnant
        ? boardUsePenalty * (bLen / maxBoardLength)
        : 0;
  }

  // Suffix sums: remainingSuffix[i] = sum of demandItems[i..end].length
  const remainingSuffix = new Float64Array(demandItems.length + 1);
  for (let i = demandItems.length - 1; i >= 0; i--) {
    remainingSuffix[i] = remainingSuffix[i + 1]! + demandItems[i]!.length;
  }

  // Smallest piece length (for frozen board detection)
  const smallestPieceLen = demandItems[demandItems.length - 1]!.length;

  // Boards sorted by length descending (for lower bound: greedy cover)
  const boardsByLenDesc: number[] = [];
  for (let i = 0; i < boards.length; i++) boardsByLenDesc.push(i);
  boardsByLenDesc.sort((a, b) => boardLenByIdx[b]! - boardLenByIdx[a]!);

  // Unique board lengths sorted ascending (for opening new boards)
  const uniqueByLength = new Map<number, number[]>();
  for (let i = 0; i < boards.length; i++) {
    const len = boardLenByIdx[i]!;
    const arr = uniqueByLength.get(len) ?? [];
    arr.push(i);
    uniqueByLength.set(len, arr);
  }
  const boardLengthsAsc = [...uniqueByLength.keys()].sort((a, b) => a - b);

  // --- Multi-start warm start ---
  const { bestBoards: ffdBoards, bestScore: ffdScore } = multiStartFFD(
    demandItems,
    boards,
    kerf,
    minUsefulRemnant,
    params,
    MULTI_START_COUNT,
  );
  // --- Local search polish on warm start ---
  const polishedBoards = localSearch(
    ffdBoards,
    boards,
    kerf,
    minUsefulRemnant,
    params,
    50,
  );
  const polishedPatterns = buildCutPatterns(
    polishedBoards,
    kerf,
    minUsefulRemnant,
  );
  const polishedScore = scoreSolution(
    polishedPatterns,
    boards,
    minUsefulRemnant,
    params,
  );

  // Use whichever is better
  const warmBoards = polishedScore < ffdScore - 1e-9 ? polishedBoards : ffdBoards;
  const warmPatterns =
    polishedScore < ffdScore - 1e-9 ? polishedPatterns : buildCutPatterns(ffdBoards, kerf, minUsefulRemnant);
  let bestScore = Math.min(ffdScore, polishedScore);
  let bestSolution: SavedBoard[] = warmBoards.map((ob) => {
    const idx = boards.findIndex((b) => b.id === ob.stockBoard.id);
    return {
      boardIndex: idx,
      pieces: [...ob.pieces],
      totalPieceLength: ob.pieces.reduce((s, p) => s + p.length, 0),
      pieceCount: ob.pieces.length,
    };
  });

  // Short-circuit: zero waste means warm start is optimal
  const warmWaste = warmPatterns.reduce(
    (sum, p) => sum + (p.remainderIsUsable ? 0 : p.remainder),
    0,
  );
  if (warmWaste < 1e-9) {
    return {
      patterns: warmPatterns,
      unfulfilled: [],
      stats: { nodesExplored: 0, nodesPruned: 0, exhaustive: true },
    };
  }

  // --- MutableBoard pool (zero allocation in hot loop) ---

  const boardPool: MutableBoard[] = [];
  for (let i = 0; i < boards.length; i++) {
    boardPool.push({
      boardIndex: 0,
      pieceCount: 0,
      totalPieceLength: 0,
      cachedCapacity: 0,
      pieces: new Array<DemandItem>(demandItems.length),
    });
  }

  // --- Emit warm start as first intermediate ---
  onIntermediatePatterns?.(warmPatterns);

  // --- Mutable search state ---

  const openBoards: MutableBoard[] = [];
  const usedMask = new Uint8Array(boards.length);
  let currentBoardPenalty = 0; // sum of proportional penalties for open boards
  let nodesExplored = 0;
  let nodesPruned = 0;
  let cancelled = false;
  const startTime = performance.now();
  let lastProgressTime = startTime;
  let lastIntermediateTime = startTime;
  const PROGRESS_INTERVAL_MS = 500;
  const INTERMEDIATE_INTERVAL_MS = 2000;

  // --- Inline leaf scoring (zero allocation) ---

  function scoreLeaf(): number {
    let score = currentBoardPenalty;

    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const boardLen = boardLenByIdx[board.boardIndex]!;
      const n = board.pieceCount;
      const pLen = board.totalPieceLength;
      const betweenKerf = (n - 1) * kerf; // n >= 1 always
      const rawRem = boardLen - pLen - betweenKerf;
      const trailKerf = rawRem >= kerf ? kerf : 0;
      const remainder = boardLen - pLen - betweenKerf - trailKerf;

      if (remainder >= minUsefulRemnant) {
        score -= leftoverBonus * powFn(remainder / maxBoardLength);
      } else {
        score += wastePenalty * wasteVal(remainder);
      }
    }

    return score;
  }

  // --- Lower bound (zero allocation, frozen board detection) ---

  function lowerBound(pieceIdx: number): number {
    let lb = currentBoardPenalty;

    const totalRemaining = remainingSuffix[pieceIdx]!;
    if (totalRemaining === 0) return lb;

    const remainingCount = demandItems.length - pieceIdx;

    // Available capacity in open boards, with frozen board detection
    let availableInOpen = 0;
    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const cap = board.cachedCapacity;
      const nextKerf = board.pieceCount > 0 ? kerf : 0;
      const availForNext = cap > nextKerf ? cap - nextKerf : 0;

      if (availForNext < smallestPieceLen - 1e-9) {
        // Frozen board — compute exact remainder contribution
        const trailKerf = cap >= kerf ? kerf : 0;
        const remainder = cap - trailKerf;
        if (remainder >= minUsefulRemnant) {
          lb -= leftoverBonus * powFn(remainder / maxBoardLength);
        } else if (remainder > 0) {
          lb += wastePenalty * wasteVal(remainder);
        }
      } else {
        availableInOpen += availForNext;
      }
    }

    const unplaced = totalRemaining - availableInOpen;
    if (unplaced <= 0) return lb;

    // Greedy cover with unused boards (pre-sorted largest first)
    const avgPieceLen =
      remainingCount > 0 ? totalRemaining / remainingCount : totalRemaining;
    let covered = 0;
    for (let i = 0; i < boardsByLenDesc.length; i++) {
      if (covered >= unplaced) break;
      const bi = boardsByLenDesc[i]!;
      if (usedMask[bi]) continue;
      const bLen = boardLenByIdx[bi]!;
      const estPieces = Math.max(
        1,
        Math.floor((bLen + kerf) / (avgPieceLen + kerf)),
      );
      const effectiveCap = bLen - (estPieces - 1) * kerf - kerf;
      covered += Math.max(0, effectiveCap);
      lb += boardPenaltyByIdx[bi]!;
    }

    if (covered < unplaced) return Infinity;
    return lb;
  }

  // --- Root LB proximity check ---
  const rootLB = lowerBound(0);
  if (bestScore - rootLB < wastePenalty) {
    return {
      patterns: warmPatterns,
      unfulfilled: [],
      stats: { nodesExplored: 0, nodesPruned: 0, exhaustive: true },
    };
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
          // Emit intermediate patterns (throttled separately)
          if (onIntermediatePatterns && now - lastIntermediateTime >= INTERMEDIATE_INTERVAL_MS) {
            lastIntermediateTime = now;
            const intBoards: OpenBoard[] = bestSolution.map((s) => ({
              stockBoard: boards[s.boardIndex]!,
              pieces: s.pieces.slice(0, s.pieceCount),
              usedLength: s.totalPieceLength + Math.max(0, s.pieceCount - 1) * kerf,
              remainingCapacity:
                boardLenByIdx[s.boardIndex]! -
                s.totalPieceLength -
                Math.max(0, s.pieceCount - 1) * kerf,
            }));
            onIntermediatePatterns(buildCutPatterns(intBoards, kerf, minUsefulRemnant));
          }
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
    // Find best-fit board (try first for better pruning)
    let bestFitIdx = -1;
    let bestFitRemaining = Infinity;
    for (let i = minChoice; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const kerfNeeded = board.pieceCount > 0 ? kerf : 0;
      const cap = board.cachedCapacity;
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
      const kerfCost = board.pieceCount > 0 ? kerf : 0;
      board.pieces[board.pieceCount] = piece;
      board.pieceCount++;
      board.totalPieceLength += piece.length;
      board.cachedCapacity -= piece.length + kerfCost;

      recurse(pieceIdx + 1, bestFitIdx);

      board.pieceCount--;
      board.totalPieceLength -= piece.length;
      board.cachedCapacity += piece.length + kerfCost;
      if (cancelled) return;
    }

    // Try other open boards with board-state symmetry dedup
    let prevStateLen = -1;
    let prevStatePc = -1;
    let prevStatePl = -1;
    for (let i = minChoice; i < openBoards.length; i++) {
      if (i === bestFitIdx) continue;
      const board = openBoards[i]!;
      const boardLen = boardLenByIdx[board.boardIndex]!;

      // Board-state symmetry: skip if same state as previously tried
      if (
        boardLen === prevStateLen &&
        board.pieceCount === prevStatePc &&
        Math.abs(board.totalPieceLength - prevStatePl) < 1e-9
      ) {
        continue;
      }

      const kerfNeeded = board.pieceCount > 0 ? kerf : 0;
      const cap = board.cachedCapacity;
      if (piece.length + kerfNeeded <= cap + 1e-9) {
        prevStateLen = boardLen;
        prevStatePc = board.pieceCount;
        prevStatePl = board.totalPieceLength;

        board.pieces[board.pieceCount] = piece;
        board.pieceCount++;
        board.totalPieceLength += piece.length;
        board.cachedCapacity -= piece.length + kerfNeeded;

        recurse(pieceIdx + 1, i);

        board.pieceCount--;
        board.totalPieceLength -= piece.length;
        board.cachedCapacity += piece.length + kerfNeeded;
        if (cancelled) return;
      }
    }

    // --- Branch 2: open a new board ---
    // Skip entirely if all remaining pieces fit in existing slack
    let totalAvailInOpen = 0;
    for (let i = 0; i < openBoards.length; i++) {
      const board = openBoards[i]!;
      const nextKerf = board.pieceCount > 0 ? kerf : 0;
      totalAvailInOpen += Math.max(0, board.cachedCapacity - nextKerf);
    }
    if (remainingSuffix[pieceIdx]! <= totalAvailInOpen + 1e-9) {
      return;
    }

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

      // Open board from pool (zero allocation)
      const newBoard = boardPool[newOpenIdx]!;
      newBoard.boardIndex = boardIdx;
      newBoard.pieceCount = 1;
      newBoard.totalPieceLength = piece.length;
      newBoard.cachedCapacity = boardLenByIdx[boardIdx]! - piece.length;
      newBoard.pieces[0] = piece;
      openBoards.push(newBoard);
      usedMask[boardIdx] = 1;
      currentBoardPenalty += boardPenaltyByIdx[boardIdx]!;

      recurse(pieceIdx + 1, newOpenIdx);

      // Undo
      openBoards.pop();
      usedMask[boardIdx] = 0;
      currentBoardPenalty -= boardPenaltyByIdx[boardIdx]!;
      if (cancelled) return;
    }
  }

  // --- Kick off search ---
  recurse(0, 0);

  // --- Build final result from best solution + local search polish ---
  const rawFinalBoards: OpenBoard[] = bestSolution.map((s) => ({
    stockBoard: boards[s.boardIndex]!,
    pieces: s.pieces.slice(0, s.pieceCount),
    usedLength: s.totalPieceLength + Math.max(0, s.pieceCount - 1) * kerf,
    remainingCapacity:
      boardLenByIdx[s.boardIndex]! -
      s.totalPieceLength -
      Math.max(0, s.pieceCount - 1) * kerf,
  }));

  const finalBoards = localSearch(
    rawFinalBoards,
    boards,
    kerf,
    minUsefulRemnant,
    params,
    50,
  );
  const patterns = buildCutPatterns(finalBoards, kerf, minUsefulRemnant);

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
      boards,
      demandItems,
      kerf,
      minUsefulRemnant,
      scoringParams,
      typeTimeBudget,
      onProgress,
      (intermediatePatterns) => {
        // Build a full intermediate result combining completed types + current type's progress
        const combined = { ...patternsByType };
        combined[typeName] = intermediatePatterns;
        const intermediateResult: CutOptimizerResult = {
          patternsByType: combined,
          unfulfilled: [...allUnfulfilled],
          summary: computeSummary(combined, input.stockTypes, minUsefulRemnant),
        };
        onProgress({
          elapsedMs: performance.now() - startTime,
          nodesExplored: 0,
          bestScore: 0,
          boardsUsedInBest: intermediatePatterns.length,
          improved: true,
          intermediateResult,
        });
      },
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
