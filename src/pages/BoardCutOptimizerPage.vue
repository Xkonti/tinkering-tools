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
                <DistanceInput
                  v-model="kerf"
                  :raw-input="kerfRaw"
                  :display-settings="dsSettings"
                  outlined
                  label="Kerf (blade thickness)"
                  @update:raw-input="kerfRaw = $event"
                />
              </div>
              <div class="col-6">
                <DistanceInput
                  v-model="minUsefulRemnant"
                  :raw-input="minUsefulRemnantRaw"
                  :display-settings="dsSettings"
                  outlined
                  label="Min useful remnant"
                  @update:raw-input="minUsefulRemnantRaw = $event"
                />
              </div>
              <div class="col-12">
                <q-btn-toggle
                  v-model="unitSystem"
                  no-caps
                  rounded
                  toggle-color="primary"
                  :options="[
                    { label: 'Imperial', value: 'imperial' },
                    { label: 'Metric', value: 'metric' },
                  ]"
                />
              </div>
              <template
                v-if="unitSystem === 'metric'"
              >
                <div class="col-6">
                  <q-select
                    v-model="metricUnitSymbol"
                    :options="metricUnitOptions"
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Display unit"
                  />
                </div>
                <div class="col-6">
                  <q-select
                    v-model="metricResolutionMm"
                    :options="metricPrecisionOptions"
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Precision"
                  />
                </div>
              </template>
              <template v-else>
                <div class="col-6">
                  <q-select
                    v-model="imperialPrecision"
                    :options="imperialPrecisionOptions"
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Precision"
                  />
                </div>
                <div class="col-6">
                  <q-toggle
                    v-model="imperialShowFeet"
                    label="Show feet"
                    dense
                  />
                </div>
              </template>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="roundingStrategy"
                  :options="roundingOptions"
                  outlined
                  dense
                  emit-value
                  map-options
                  label="Rounding"
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
                    <DistanceInput
                      v-model="board.length"
                      :raw-input="board.lengthRaw"
                      :display-settings="dsSettings"
                      outlined
                      dense
                      label="Board length"
                      @update:raw-input="board.lengthRaw = $event"
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
                  <div class="col">
                    <q-input
                      v-model="board.name"
                      outlined
                      dense
                      label="Name (optional)"
                      placeholder="e.g. From concrete framing"
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
                <DistanceInput
                  v-model="piece.length"
                  :raw-input="piece.lengthRaw"
                  :display-settings="dsSettings"
                  outlined
                  dense
                  label="Piece length"
                  @update:raw-input="piece.lengthRaw = $event"
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
                {{ uf.quantity }}&times; {{ fmtDist(uf.length) }}
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
                <div class="col-6 col-md-2">
                  <div class="text-subtitle2 text-grey-7">Stock Used</div>
                  <div class="text-h5">
                    {{ result.summary.totalStockUsed }} boards
                  </div>
                </div>
                <div class="col-6 col-md-2">
                  <div class="text-subtitle2 text-grey-7">Efficiency</div>
                  <div class="text-h5 text-primary">
                    {{ result.summary.efficiencyPercent.toFixed(1) }}%
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">
                    Preserved Stock
                  </div>
                  <div class="text-h5 text-positive">
                    {{ fmtDist(result.summary.preservedStockLength) }}
                  </div>
                </div>
                <div class="col-6 col-md-2">
                  <div class="text-subtitle2 text-grey-7">Waste</div>
                  <div class="text-h5 text-negative">
                    {{ fmtDist(result.summary.totalWaste) }}
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="text-subtitle2 text-grey-7">
                    Usable Remnants
                  </div>
                  <div class="text-h5 text-warning">
                    {{ fmtDist(result.summary.usableRemnants) }}
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
                  Board #{{ pIdx + 1 }}
                  ({{ fmtDist(pattern.stockBoard.length) }}){{
                    pattern.stockBoard.name
                      ? ' — ' + pattern.stockBoard.name
                      : ''
                  }}
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
                        {{ fmtDist(piece.length)
                        }}{{
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
                      {{ fmtDist(pattern.remainder) }}
                      {{ pattern.remainderIsUsable ? 'usable' : 'waste' }}
                    </span>
                    <q-tooltip>
                      {{ fmtDist(pattern.remainder) }} —
                      {{ pattern.remainderIsUsable ? 'Usable remnant' : 'Waste' }}
                    </q-tooltip>
                  </div>
                </div>

                <!-- Text summary -->
                <div class="text-caption text-grey-7 q-mt-xs">
                  Pieces:
                  {{
                    pattern.pieces
                      .map(
                        (p) =>
                          (p.name ? p.name + ' ' : '') + fmtDist(p.length),
                      )
                      .join(', ')
                  }}
                  &nbsp;|&nbsp; Kerf: {{ fmtDist(pattern.totalKerf) }}
                  &nbsp;|&nbsp; Remainder:
                  {{ fmtDist(pattern.remainder) }}
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
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { optimizeCuts } from 'src/utils/boardCutOptimizer';
import type {
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  PlacedPiece,
  StockBoard,
} from 'src/utils/boardCutOptimizer';
import { useBoardCutOptimizerStore } from 'src/stores/boardCutOptimizer';
import { useDisplaySettingsStore } from 'src/stores/displaySettings';
import { formatDistanceWithSettings } from 'src/utils/unitParsing';
import DistanceInput from 'src/components/DistanceInput.vue';

const store = useBoardCutOptimizerStore();
const {
  kerf,
  kerfRaw,
  minUsefulRemnant,
  minUsefulRemnantRaw,
  stockTypes,
  requiredPieces,
  stockTypeNames,
} = storeToRefs(store);
const {
  addStockType,
  removeStockType,
  addBoard,
  removeBoard,
  addRequiredPiece,
  removeRequiredPiece,
} = store;

// --- Display settings ---

const displaySettingsStore = useDisplaySettingsStore();
const {
  unitSystem,
  metricUnitSymbol,
  metricResolutionMm,
  imperialPrecision,
  imperialShowFeet,
  roundingStrategy,
  settings: dsSettings,
} = storeToRefs(displaySettingsStore);

const metricUnitOptions = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
  { label: 'dm', value: 'dm' },
  { label: 'm', value: 'm' },
];

const metricPrecisionOptions = [
  { label: '1cm', value: 10 },
  { label: '1mm', value: 1 },
  { label: '0.1mm', value: 0.1 },
  { label: '0.01mm', value: 0.01 },
];

const imperialPrecisionOptions = [
  { label: '1/4"', value: 4 },
  { label: '1/8"', value: 8 },
  { label: '1/16"', value: 16 },
  { label: '1/32"', value: 32 },
  { label: '1/64"', value: 64 },
  { label: '1/128"', value: 128 },
];

const roundingOptions = [
  { label: 'Round up (ceil) — always longer', value: 'ceil' },
  { label: 'Round down (floor) — always shorter', value: 'floor' },
  { label: 'Mathematical round', value: 'round' },
];

function fmtDist(mm: number): string {
  return formatDistanceWithSettings(mm, dsSettings.value);
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
        const board: StockBoard = {
          id: crypto.randomUUID(),
          stockTypeName: st.name,
          length: b.length,
        };
        if (b.name) board.name = b.name;
        boards.push(board);
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

const result = ref<CutOptimizerResult | null>(null);
watch(
  [kerf, minUsefulRemnant, stockTypes, requiredPieces],
  () => {
    const inp = buildInput();
    result.value = inp ? optimizeCuts(inp) : null;
  },
  { deep: true, immediate: true },
);

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
  const hash = Math.round(length * 1000);
  return PIECE_COLORS[hash % PIECE_COLORS.length] ?? PIECE_COLORS[0]!;
}

function pieceLabel(piece: PlacedPiece): string {
  if (piece.name) return `${piece.name} ${fmtDist(piece.length)}`;
  return fmtDist(piece.length);
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}
</script>
