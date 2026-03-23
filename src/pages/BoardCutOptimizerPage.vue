<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- Settings -->
      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">Settings</div>
            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-input
                  v-model.number="kerf"
                  type="number"
                  outlined
                  label="Kerf (blade thickness)"
                  suffix="in"
                  step="0.0625"
                  min="0"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="minUsefulRemnant"
                  type="number"
                  outlined
                  label="Min useful remnant"
                  suffix="in"
                  min="0"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Stock Inventory -->
      <div class="col-12">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">Stock Inventory</div>

            <q-card
              v-for="st in stockTypes"
              :key="st.id"
              flat
              bordered
              class="q-mb-md"
            >
              <q-card-section>
                <div class="row items-center q-col-gutter-sm q-mb-sm">
                  <div class="col">
                    <q-input
                      v-model="st.name"
                      outlined
                      dense
                      label="Stock type name"
                      placeholder="e.g. 2x4"
                    />
                  </div>
                  <div class="col-auto">
                    <q-btn
                      flat
                      dense
                      round
                      icon="delete"
                      color="negative"
                      :disable="stockTypes.length <= 1"
                      @click="removeStockType(st.id)"
                    />
                  </div>
                </div>

                <div
                  v-for="board in st.boards"
                  :key="board.id"
                  class="row items-center q-col-gutter-sm q-mb-xs"
                >
                  <div class="col">
                    <q-input
                      v-model.number="board.length"
                      type="number"
                      outlined
                      dense
                      label="Board length"
                      suffix="in"
                      min="0"
                    />
                  </div>
                  <div class="col">
                    <q-input
                      v-model.number="board.quantity"
                      type="number"
                      outlined
                      dense
                      label="Quantity"
                      min="1"
                    />
                  </div>
                  <div class="col-auto">
                    <q-btn
                      flat
                      dense
                      round
                      icon="remove_circle_outline"
                      color="grey"
                      :disable="st.boards.length <= 1"
                      @click="removeBoard(st, board.id)"
                    />
                  </div>
                </div>

                <q-btn
                  flat
                  dense
                  no-caps
                  icon="add"
                  label="Add board length"
                  class="q-mt-xs"
                  @click="addBoard(st)"
                />
              </q-card-section>
            </q-card>

            <q-btn
              outline
              no-caps
              icon="add"
              label="Add Stock Type"
              @click="addStockType"
            />
          </q-card-section>
        </q-card>
      </div>

      <!-- Required Pieces -->
      <div class="col-12">
        <q-card>
          <q-card-section>
            <div class="text-h6 q-mb-md">Required Pieces</div>

            <div
              v-for="piece in requiredPieces"
              :key="piece.id"
              class="row items-center q-col-gutter-sm q-mb-xs"
            >
              <div class="col">
                <q-select
                  v-model="piece.stockTypeName"
                  :options="stockTypeNames"
                  outlined
                  dense
                  label="Stock type"
                  emit-value
                  map-options
                />
              </div>
              <div class="col">
                <q-input
                  v-model.number="piece.length"
                  type="number"
                  outlined
                  dense
                  label="Piece length"
                  suffix="in"
                  min="0"
                />
              </div>
              <div class="col">
                <q-input
                  v-model.number="piece.quantity"
                  type="number"
                  outlined
                  dense
                  label="Quantity"
                  min="1"
                />
              </div>
              <div class="col">
                <q-input
                  v-model="piece.name"
                  outlined
                  dense
                  label="Name (optional)"
                  placeholder="e.g. Table leg"
                />
              </div>
              <div class="col-auto">
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  :disable="requiredPieces.length <= 1"
                  @click="removeRequiredPiece(piece.id)"
                />
              </div>
            </div>

            <q-btn
              outline
              no-caps
              icon="add"
              label="Add Required Piece"
              class="q-mt-sm"
              @click="addRequiredPiece"
            />
          </q-card-section>
        </q-card>
      </div>

      <!-- Results -->
      <template v-if="result">
        <!-- Unfulfilled warning -->
        <div v-if="result.unfulfilled.length > 0" class="col-12">
          <q-banner class="bg-orange-8 text-white rounded-borders">
            <template #avatar>
              <q-icon name="warning" />
            </template>
            <div class="text-subtitle2">
              Some pieces could not be fulfilled:
            </div>
            <ul class="q-mb-none q-mt-xs">
              <li v-for="(uf, idx) in result.unfulfilled" :key="idx">
                {{ uf.quantity }}&times; {{ uf.length }}&quot;
                {{ uf.stockTypeName }}{{ uf.name ? ' (' + uf.name + ')' : '' }}
                &mdash; {{ uf.reason }}
              </li>
            </ul>
          </q-banner>
        </div>

        <!-- Summary -->
        <div class="col-12">
          <q-card>
            <q-card-section>
              <div class="text-h6 q-mb-md">Summary</div>
              <div class="row q-col-gutter-md">
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">Stock Used</div>
                  <div class="text-h5">
                    {{ result.summary.totalStockUsed }} boards
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">Efficiency</div>
                  <div class="text-h5 text-primary">
                    {{ result.summary.efficiencyPercent.toFixed(1) }}%
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">Waste</div>
                  <div class="text-h5 text-negative">
                    {{ result.summary.totalWaste.toFixed(2) }}&quot;
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">
                    Usable Remnants
                  </div>
                  <div class="text-h5 text-warning">
                    {{ result.summary.usableRemnants.toFixed(2) }}&quot;
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Cut Patterns by Type -->
        <div
          v-for="[typeName, patterns] in sortedPatterns"
          :key="typeName"
          class="col-12"
        >
          <q-card>
            <q-card-section>
              <div class="text-h6 q-mb-md">{{ typeName }} Cut Patterns</div>

              <div
                v-for="(pattern, pIdx) in patterns"
                :key="pIdx"
                class="q-mb-md"
              >
                <div class="text-subtitle2 q-mb-xs">
                  Board #{{ pIdx + 1 }} ({{ pattern.stockBoard.length }}&quot;)
                </div>

                <!-- Visual bar -->
                <div
                  :style="{
                    display: 'flex',
                    height: '36px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: '1px solid #ccc',
                  }"
                >
                  <template
                    v-for="(piece, pieceIdx) in pattern.pieces"
                    :key="'p' + String(pieceIdx)"
                  >
                    <div
                      :style="{
                        flexBasis:
                          toPercent(piece.length, pattern.stockBoard.length) +
                          '%',
                        backgroundColor: pieceColor(piece.length),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        minWidth: '0',
                        padding: '0 2px',
                        cursor: 'pointer',
                      }"
                      class="text-caption text-white text-center"
                    >
                      <span
                        :style="{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }"
                      >
                        {{ pieceLabel(piece) }}
                      </span>
                      <q-tooltip>
                        {{ piece.length }}&quot;{{
                          piece.name ? ' — ' + piece.name : ''
                        }}
                      </q-tooltip>
                    </div>
                    <!-- Kerf gap -->
                    <div
                      v-if="pieceIdx < pattern.pieces.length - 1"
                      :style="{
                        flexBasis:
                          toPercent(kerf, pattern.stockBoard.length) + '%',
                        backgroundColor: '#212121',
                        minWidth: '1px',
                      }"
                    />
                  </template>

                  <!-- Remainder -->
                  <div
                    v-if="pattern.remainder > 0"
                    :style="{
                      flexBasis:
                        toPercent(
                          pattern.remainder,
                          pattern.stockBoard.length,
                        ) + '%',
                      backgroundColor: pattern.remainderIsUsable
                        ? '#FFC107'
                        : '#BDBDBD',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      minWidth: '0',
                      padding: '0 2px',
                      cursor: 'pointer',
                    }"
                    class="text-caption text-center"
                  >
                    <span
                      :style="{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }"
                    >
                      {{ pattern.remainder.toFixed(1) }}&quot;
                      {{ pattern.remainderIsUsable ? 'usable' : 'waste' }}
                    </span>
                    <q-tooltip>
                      {{ pattern.remainder.toFixed(2) }}&quot; —
                      {{ pattern.remainderIsUsable ? 'Usable remnant' : 'Waste' }}
                    </q-tooltip>
                  </div>
                </div>

                <!-- Text summary -->
                <div class="text-caption text-grey-7 q-mt-xs">
                  Pieces:
                  {{
                    pattern.pieces
                      .map((p) => (p.name ? p.name + ' ' : '') + p.length + '"')
                      .join(', ')
                  }}
                  &nbsp;|&nbsp; Kerf: {{ pattern.totalKerf.toFixed(3) }}&quot;
                  &nbsp;|&nbsp; Remainder:
                  {{ pattern.remainder.toFixed(2) }}&quot;
                  ({{ pattern.remainderIsUsable ? 'usable' : 'waste' }})
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </template>

      <!-- Empty state -->
      <div v-else class="col-12">
        <q-card>
          <q-card-section class="text-center text-grey-5">
            Fill in stock inventory and required pieces to see optimized cut
            patterns
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { optimizeCuts } from 'src/utils/boardCutOptimizer';
import type {
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  PlacedPiece,
  StockBoard,
} from 'src/utils/boardCutOptimizer';

// --- UI input state ---

interface StockTypeInput {
  id: string;
  name: string;
  boards: { id: string; length: number | null; quantity: number | null }[];
}

interface RequiredPieceInput {
  id: string;
  stockTypeName: string;
  length: number | null;
  quantity: number | null;
  name: string;
}

const kerf = ref<number>(0.125);
const minUsefulRemnant = ref<number>(10);

const stockTypes = ref<StockTypeInput[]>([
  {
    id: crypto.randomUUID(),
    name: '2x4',
    boards: [{ id: crypto.randomUUID(), length: 96, quantity: 10 }],
  },
]);

const requiredPieces = ref<RequiredPieceInput[]>([
  {
    id: crypto.randomUUID(),
    stockTypeName: '2x4',
    length: 24,
    quantity: 10,
    name: '',
  },
]);

// --- Computed helpers ---

const stockTypeNames = computed(() =>
  stockTypes.value.map((s) => s.name).filter((n) => n.length > 0),
);

// --- Actions ---

function addStockType() {
  stockTypes.value.push({
    id: crypto.randomUUID(),
    name: '',
    boards: [{ id: crypto.randomUUID(), length: null, quantity: null }],
  });
}

function removeStockType(id: string) {
  stockTypes.value = stockTypes.value.filter((s) => s.id !== id);
}

function addBoard(st: StockTypeInput) {
  st.boards.push({ id: crypto.randomUUID(), length: null, quantity: null });
}

function removeBoard(st: StockTypeInput, boardId: string) {
  st.boards = st.boards.filter((b) => b.id !== boardId);
}

function addRequiredPiece() {
  requiredPieces.value.push({
    id: crypto.randomUUID(),
    stockTypeName: stockTypeNames.value[0] ?? '',
    length: null,
    quantity: null,
    name: '',
  });
}

function removeRequiredPiece(id: string) {
  requiredPieces.value = requiredPieces.value.filter((p) => p.id !== id);
}

// --- Optimization ---

function buildInput(): CutOptimizerInput | null {
  const k = kerf.value;
  const minR = minUsefulRemnant.value;
  if (!Number.isFinite(k) || k < 0) return null;
  if (!Number.isFinite(minR) || minR < 0) return null;

  const types: CutOptimizerInput['stockTypes'] = [];
  for (const st of stockTypes.value) {
    if (!st.name) return null;
    const boards: StockBoard[] = [];
    for (const b of st.boards) {
      if (b.length === null || b.quantity === null) return null;
      if (!Number.isFinite(b.length) || b.length <= 0) return null;
      if (!Number.isFinite(b.quantity) || b.quantity < 1) return null;
      for (let i = 0; i < b.quantity; i++) {
        boards.push({
          id: crypto.randomUUID(),
          stockTypeName: st.name,
          length: b.length,
        });
      }
    }
    types.push({ name: st.name, boards });
  }

  const pieces: CutOptimizerInput['requiredPieces'] = [];
  for (const rp of requiredPieces.value) {
    if (!rp.stockTypeName) return null;
    if (rp.length === null || rp.quantity === null) return null;
    if (!Number.isFinite(rp.length) || rp.length <= 0) return null;
    if (!Number.isFinite(rp.quantity) || rp.quantity < 1) return null;
    const piece: CutOptimizerInput['requiredPieces'][number] = {
      stockTypeName: rp.stockTypeName,
      length: rp.length,
      quantity: rp.quantity,
    };
    if (rp.name) piece.name = rp.name;
    pieces.push(piece);
  }

  if (types.length === 0 || pieces.length === 0) return null;

  return {
    stockTypes: types,
    requiredPieces: pieces,
    kerf: k,
    minUsefulRemnant: minR,
  };
}

const result = computed<CutOptimizerResult | null>(() => {
  const input = buildInput();
  if (!input) return null;
  return optimizeCuts(input);
});

const sortedPatterns = computed<[string, CutPattern[]][]>(() => {
  if (!result.value) return [];
  return Object.entries(result.value.patternsByType).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
});

// --- Visualization helpers ---

const PIECE_COLORS = [
  '#4CAF50',
  '#2196F3',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
  '#E91E63',
  '#8BC34A',
  '#FF5722',
];

function pieceColor(length: number): string {
  // Deterministic color based on piece length
  const hash = Math.round(length * 1000);
  return PIECE_COLORS[hash % PIECE_COLORS.length] ?? PIECE_COLORS[0]!;
}

function pieceLabel(piece: PlacedPiece): string {
  if (piece.name) return `${piece.name} ${String(piece.length)}"`;
  return `${String(piece.length)}"`;
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}
</script>
