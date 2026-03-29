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

  // Sort longest first, then by name for symmetry breaking
  demandItems.sort(
    (a, b) =>
      b.length - a.length ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );
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
// Multi-start FFD warm start
// ============================================================

function multiStartFFD(
  demandItems: DemandItem[],
  boards: StockBoard[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  numStarts: number,
): { bestBoards: OpenBoard[]; bestScore: number } {
  // Standard longest-first FFD
  let bestBoards = ffdWarmStart(demandItems, boards, kerf);
  const bestPatterns = buildCutPatterns(bestBoards, kerf, minUsefulRemnant);
  let bestScore = scoreSolution(
    bestPatterns,
    boards,
    minUsefulRemnant,
    params,
  );

  // Shuffled orderings
  for (let s = 0; s < numStarts; s++) {
    const shuffled = [...demandItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const trialBoards = ffdWarmStart(shuffled, boards, kerf);
    const trialPatterns = buildCutPatterns(trialBoards, kerf, minUsefulRemnant);
    const trialScore = scoreSolution(
      trialPatterns,
      boards,
      minUsefulRemnant,
      params,
    );
    if (trialScore < bestScore - 1e-9) {
      bestScore = trialScore;
      bestBoards = trialBoards;
    }
  }

  return { bestBoards, bestScore };
}

// ============================================================
// Local search post-processing
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

function scoreLSBoards(
  lsBoards: LSBoard[],
  allBoards: StockBoard[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
): number {
  const patterns = lsBoards.map((b) => {
    const sb = allBoards[b.boardIndex]!;
    const n = b.pieces.length;
    const pLen = b.totalPieceLength;
    const betweenKerf = Math.max(0, n - 1) * kerf;
    const rawRem = sb.length - pLen - betweenKerf;
    const trailKerf = rawRem >= kerf ? kerf : 0;
    const remainder = sb.length - pLen - betweenKerf - trailKerf;
    return {
      stockBoard: sb,
      pieces: b.pieces.map((p) => ({
        length: p.length,
        startOffset: 0,
        ...(p.name ? { name: p.name } : {}),
      })),
      totalKerf: betweenKerf + trailKerf,
      remainder,
      remainderIsUsable: remainder >= minUsefulRemnant,
    };
  });
  return scoreSolution(patterns, allBoards, minUsefulRemnant, params);
}

function localSearch(
  openBoards: OpenBoard[],
  allBoards: StockBoard[],
  kerf: number,
  minUsefulRemnant: number,
  params: ScoringParams,
  maxPasses: number,
): OpenBoard[] {
  // Convert to mutable LS boards
  const lsBoards: LSBoard[] = openBoards.map((ob) => {
    const idx = allBoards.findIndex((b) => b.id === ob.stockBoard.id);
    return {
      boardIndex: idx,
      pieces: [...ob.pieces],
      totalPieceLength: ob.pieces.reduce((s, p) => s + p.length, 0),
    };
  });

  let bestScore = scoreLSBoards(
    lsBoards,
    allBoards,
    kerf,
    minUsefulRemnant,
    params,
  );

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
            // Try the move
            src.pieces.splice(pi, 1);
            src.totalPieceLength -= piece.length;
            dst.pieces.push(piece);
            dst.totalPieceLength += piece.length;

            const newScore = scoreLSBoards(
              lsBoards.filter((b) => b.pieces.length > 0),
              allBoards,
              kerf,
              minUsefulRemnant,
              params,
            );

            if (newScore < bestScore - 1e-9) {
              bestScore = newScore;
              improved = true;
              // Keep the move; break to recheck from scratch
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

    if (improved) continue;

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

            // Temporarily swap
            boardA.pieces[ai] = pieceB;
            boardA.totalPieceLength += pieceB.length - pieceA.length;
            boardB.pieces[bi] = pieceA;
            boardB.totalPieceLength += pieceA.length - pieceB.length;

            // Check feasibility
            const aFits =
              boardCapacity(boardA, aLen, kerf) >= -1e-9;
            const bFits =
              boardCapacity(boardB, bLen, kerf) >= -1e-9;

            if (aFits && bFits) {
              const newScore = scoreLSBoards(
                lsBoards,
                allBoards,
                kerf,
                minUsefulRemnant,
                params,
              );
              if (newScore < bestScore - 1e-9) {
                bestScore = newScore;
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
const STAGNATION_LIMIT = 20_000_000;

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

  // Board lengths in a flat typed array (avoids StockBoard pointer chase)
  const boardLenByIdx = new Float64Array(boards.length);
  for (let i = 0; i < boards.length; i++) {
    boardLenByIdx[i] = boards[i]!.length;
  }

  // Suffix sums: remainingSuffix[i] = sum of demandItems[i..end].length
  const remainingSuffix = new Float64Array(demandItems.length + 1);
  for (let i = demandItems.length - 1; i >= 0; i--) {
    remainingSuffix[i] = remainingSuffix[i + 1]! + demandItems[i]!.length;
  }

  // Smallest piece length (for frozen board detection)
  const smallestPieceLen = demandItems[demandItems.length - 1]!.length;

  // Per-board unused score contribution (precomputed)
  const boardUnusedContrib = new Float64Array(boards.length);
  let baseUnusedScore = 0;
  for (let i = 0; i < boards.length; i++) {
    const bLen = boardLenByIdx[i]!;
    if (bLen >= minUsefulRemnant) {
      boardUnusedContrib[i] =
        -leftoverBonus * powFn(bLen / maxBoardLength);
    } else {
      boardUnusedContrib[i] = wastePenalty * bLen;
    }
    baseUnusedScore += boardUnusedContrib[i]!;
  }

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

  // --- Mutable search state ---

  const openBoards: MutableBoard[] = [];
  const usedMask = new Uint8Array(boards.length);
  let currentUnusedScore = baseUnusedScore;
  let nodesExplored = 0;
  let nodesPruned = 0;
  let nodesSinceImprovement = 0;
  let cancelled = false;
  const startTime = performance.now();
  let lastProgressTime = startTime;
  const PROGRESS_INTERVAL_MS = 500;

  // --- Inline leaf scoring (zero allocation) ---

  function scoreLeaf(): number {
    let score = boardUsePenalty * openBoards.length;
    score += currentUnusedScore;

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
        score += wastePenalty * remainder;
      }
    }

    return score;
  }

  // --- Lower bound (zero allocation, frozen board detection) ---

  function lowerBound(pieceIdx: number): number {
    let lb = boardUsePenalty * openBoards.length;
    lb += currentUnusedScore;

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
          lb += wastePenalty * remainder;
        }
      } else {
        availableInOpen += availForNext;
      }
    }

    const unplaced = totalRemaining - availableInOpen;
    if (unplaced <= 0) return lb;

    // Greedy cover with unused boards (pre-sorted largest first)
    // Better kerf accounting: estimate pieces per new board
    const avgPieceLen =
      remainingCount > 0 ? totalRemaining / remainingCount : totalRemaining;
    let covered = 0;
    for (let i = 0; i < boardsByLenDesc.length; i++) {
      if (covered >= unplaced) break;
      const bi = boardsByLenDesc[i]!;
      if (usedMask[bi]) continue;
      const bLen = boardLenByIdx[bi]!;
      // Estimate how many pieces fit and deduct proportional kerf
      const estPieces = Math.max(
        1,
        Math.floor((bLen + kerf) / (avgPieceLen + kerf)),
      );
      const effectiveCap = bLen - (estPieces - 1) * kerf - kerf;
      covered += Math.max(0, effectiveCap);
      // This board transitions from unused to used
      lb -= boardUnusedContrib[bi]!;
      lb += boardUsePenalty;
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
    nodesSinceImprovement++;

    if (nodesExplored % CANCEL_CHECK_INTERVAL === 0) {
      const now = performance.now();
      const elapsed = now - startTime;
      if (elapsed > timeLimitMs || nodesSinceImprovement > STAGNATION_LIMIT) {
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
        nodesSinceImprovement = 0;
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
