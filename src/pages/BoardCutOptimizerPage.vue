<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- Project bar -->
      <div class="col-12">
        <ToolProjectBar
          :projects="projects"
          :active-project-id="activeProject?.id"
          @switch="switchProject"
          @create="createProject"
          @duplicate="duplicateProject"
          @rename="renameProject"
          @delete="deleteProject"
          @reset="resetCurrentProject"
          @export="handleExport"
          @import="handleImport"
        />
      </div>

      <!-- Settings -->
      <div class="col-12">
        <q-separator />
        <div class="text-h6 q-my-md">Settings</div>
        <div class="row q-col-gutter-md items-center">
              <div class="col-6 col-sm-4 col-md-2">
                <DistanceInput
                  v-model="state.kerf"
                  :raw-input="state.kerfRaw"
                  :display-settings="dsSettings"
                  outlined
                  dense
                  label="Kerf (blade thickness)"
                  @update:raw-input="state.kerfRaw = $event"
                />
              </div>
              <div class="col-6 col-sm-4 col-md-2">
                <DistanceInput
                  v-model="state.minUsefulRemnant"
                  :raw-input="state.minUsefulRemnantRaw"
                  :display-settings="dsSettings"
                  outlined
                  dense
                  label="Min useful remnant"
                  @update:raw-input="state.minUsefulRemnantRaw = $event"
                />
              </div>
              <div class="col-12 col-sm-4 col-md-auto">
                <q-btn-toggle
                  v-model="state.unitSystem"
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
                v-if="state.unitSystem === 'metric'"
              >
                <div class="col-6 col-sm-4 col-md-2">
                  <q-select
                    v-model="state.metricUnitSymbol"
                    :options="metricUnitOptions"
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Display unit"
                  />
                </div>
                <div class="col-6 col-sm-4 col-md-2">
                  <q-select
                    v-model="state.metricResolutionMm"
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
                <div class="col-6 col-sm-4 col-md-2">
                  <q-select
                    v-model="state.imperialPrecision"
                    :options="imperialPrecisionOptions"
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Precision"
                  />
                </div>
                <div class="col-6 col-sm-4 col-md-auto">
                  <q-toggle
                    v-model="state.imperialShowFeet"
                    label="Show feet"
                    dense
                  />
                </div>
              </template>
              <div class="col-12 col-sm-6 col-md-3">
                <q-select
                  v-model="state.roundingStrategy"
                  :options="roundingOptions"
                  outlined
                  dense
                  emit-value
                  map-options
                  label="Rounding"
                />
              </div>
        </div>
      </div>

      <!-- Algorithm Settings -->
      <div class="col-12">
        <q-separator />
        <div class="text-h6 q-my-md">Algorithm</div>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-sm-auto">
            <q-btn-toggle
              v-model="state.algorithm"
              no-caps
              rounded
              toggle-color="primary"
              :options="[
                { label: 'FFD (Fast)', value: 'ffd' },
                { label: 'Branch & Bound (Optimal)', value: 'branchAndBound' },
              ]"
            />
          </div>
          <template v-if="state.algorithm === 'branchAndBound'">
            <div class="col-6 col-sm-3 col-md-2">
              <q-input
                v-model.number="state.bnbTimeLimitMs"
                type="number"
                outlined
                dense
                label="Time limit (ms)"
                min="1000"
                step="1000"
              >
                <template #append>
                  <q-icon name="info" class="cursor-pointer" size="xs" color="grey-6">
                    <q-tooltip max-width="300px">
                      Maximum time the algorithm will search for a better
                      solution, in milliseconds. The search stops after this
                      time and returns the best result found so far.
                      180 000 ms = 3 minutes.
                    </q-tooltip>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3 col-md-2">
              <q-input
                v-model.number="state.scoringParams.boardUsePenalty"
                type="number"
                outlined
                dense
                label="Board use penalty"
                step="10"
              >
                <template #append>
                  <q-icon name="info" class="cursor-pointer" size="xs" color="grey-6">
                    <q-tooltip max-width="300px">
                      Flat cost added to the score for every board that is
                      used. Higher values push the optimizer to pack pieces
                      onto fewer boards. Lower values allow spreading pieces
                      across more boards if that reduces waste.
                    </q-tooltip>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3 col-md-2">
              <q-input
                v-model.number="state.scoringParams.wastePenalty"
                type="number"
                outlined
                dense
                label="Waste penalty"
                step="0.1"
              >
                <template #append>
                  <q-icon name="info" class="cursor-pointer" size="xs" color="grey-6">
                    <q-tooltip max-width="300px">
                      Cost per unit length of wasted material (remainders
                      too short to be useful, plus any unused stock boards
                      shorter than the minimum useful remnant). Higher values
                      make the optimizer try harder to eliminate small scraps.
                    </q-tooltip>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3 col-md-2">
              <q-input
                v-model.number="state.scoringParams.leftoverBonus"
                type="number"
                outlined
                dense
                label="Leftover bonus"
                step="5"
              >
                <template #append>
                  <q-icon name="info" class="cursor-pointer" size="xs" color="grey-6">
                    <q-tooltip max-width="300px">
                      Reward multiplier for usable leftover pieces
                      (remainders at least as long as the minimum useful
                      remnant). Higher values make the optimizer prefer
                      layouts that leave long, reusable offcuts rather than
                      many short waste pieces. Works together with the
                      leftover value curve.
                    </q-tooltip>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3 col-md-2">
              <q-input
                v-model.number="state.scoringParams.leftoverPower"
                type="number"
                outlined
                dense
                label="Leftover value curve"
                step="0.1"
                min="0.1"
              >
                <template #append>
                  <q-icon name="info" class="cursor-pointer" size="xs" color="grey-6">
                    <q-tooltip max-width="300px">
                      Exponent that controls how much longer leftovers are
                      valued over shorter ones. At 1.0 the value grows
                      linearly with length. Values above 1.0 make long
                      leftovers disproportionately more valuable (e.g. at
                      1.5, a leftover twice as long is worth ~2.8x more).
                      Values below 1.0 flatten the curve, treating all
                      usable leftovers more equally.
                    </q-tooltip>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </template>
        </div>
      </div>

      <!-- Stock Inventory -->
      <div class="col-12">
        <q-separator />
        <div class="text-h6 q-my-md">Stock Inventory</div>

        <div
          v-for="(st, stIdx) in state.stockTypes"
          :key="st.id"
          class="q-mb-md"
        >
          <q-separator v-if="stIdx > 0" class="q-mb-md" />
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
                :disable="state.stockTypes.length <= 1"
                @click="removeStockType(st.id)"
              />
            </div>
          </div>

          <div
            v-for="board in st.boards"
            :key="board.id"
            class="row items-center q-col-gutter-sm q-mb-sm"
          >
            <div class="col-12 col-sm-5">
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
            <div class="col-5 col-sm-2">
              <q-input
                v-model.number="board.quantity"
                type="number"
                outlined
                dense
                label="Quantity"
                min="1"
              />
            </div>
            <div class="col col-sm">
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
        </div>

        <q-btn
          outline
          no-caps
          icon="add"
          label="Add Stock Type"
          @click="addStockType"
        />
      </div>

      <!-- Required Pieces -->
      <div class="col-12">
        <q-separator />
        <div class="text-h6 q-my-md">Required Pieces</div>

        <div
          v-for="piece in state.requiredPieces"
          :key="piece.id"
          class="row items-center q-col-gutter-sm q-mb-sm"
        >
          <div class="col-12 col-sm-3">
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
          <div class="col-12 col-sm-3">
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
          <div class="col-5 col-sm-2">
            <q-input
              v-model.number="piece.quantity"
              type="number"
              outlined
              dense
              label="Quantity"
              min="1"
            />
          </div>
          <div class="col col-sm">
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
              :disable="state.requiredPieces.length <= 1"
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
      </div>

      <!-- Calculate button -->
      <div class="col-12">
        <q-separator />
        <div class="row items-center q-col-gutter-md q-my-md">
          <div class="col-auto">
            <q-btn
              color="primary"
              label="Calculate"
              icon="calculate"
              no-caps
              :loading="isRunning"
              :disable="!inputValid"
              @click="calculate"
            />
          </div>
          <div v-if="isRunning" class="col-auto">
            <q-btn
              flat
              no-caps
              label="Cancel"
              icon="cancel"
              color="negative"
              @click="cancelCalculation"
            />
          </div>
          <div v-if="lastStats" class="col text-caption text-grey-7">
            {{ lastStats.totalNodesExplored.toLocaleString() }} nodes explored
            in {{ (lastStats.totalElapsedMs / 1000).toFixed(1) }}s
            {{ lastStats.exhaustive ? '(exhaustive)' : '(time limit)' }}
          </div>
        </div>
        <q-linear-progress
          v-if="isRunning && state.algorithm === 'branchAndBound'"
          indeterminate
          color="primary"
          class="q-mb-sm"
        />
        <div v-if="isRunning && state.algorithm === 'branchAndBound'" class="text-caption text-grey-7 q-mb-sm">
          {{ (elapsedMs / 1000).toFixed(1) }}s elapsed
          <template v-if="progress">
            &nbsp;|&nbsp; {{ progress.nodesExplored.toLocaleString() }} nodes
            &nbsp;|&nbsp; Best: {{ progress.boardsUsedInBest }} boards used
          </template>
        </div>
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
          <q-separator />
          <div class="text-h6 q-my-md">Summary</div>
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
        </div>

        <!-- Cut Patterns by Type -->
        <div
          v-for="[typeName, patterns] in sortedPatterns"
          :key="typeName"
          class="col-12"
        >
          <q-separator />
          <div class="text-h6 q-my-md">{{ typeName }} Cut Patterns</div>

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
                      toPercent(state.kerf, pattern.stockBoard.length) + '%',
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
        </div>
      </template>

      <!-- Empty state -->
      <div v-else class="col-12 text-center text-grey-5 q-pa-lg">
        Fill in stock inventory and required pieces, then click Calculate
      </div>
    </div>

    <!-- Import conflict dialog -->
    <q-dialog v-model="showImportConflictDialog" persistent>
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Import Conflict</div>
        </q-card-section>
        <q-card-section>
          A project named "{{ pendingImport?.originalName }}" already exists.
          You can import with a different name or replace the existing project.
          <q-input
            v-model="importDialogName"
            outlined
            dense
            label="Project name"
            class="q-mt-md"
            :error="importNameConflict"
            error-message="A project with this name already exists"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            flat
            label="Replace existing"
            color="negative"
            @click="confirmImportReplace"
          />
          <q-btn
            flat
            label="Import as new"
            color="primary"
            :disable="!importDialogName.trim() || importNameConflict"
            @click="confirmImportRename"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { storeToRefs } from 'pinia';
import { CutOptimizerWorker } from 'src/utils/boardCutOptimizer';
import type {
  BnBProgress,
  BnBStats,
  CutOptimizerInput,
  CutOptimizerResult,
  CutPattern,
  PlacedPiece,
  StockBoard,
} from 'src/utils/boardCutOptimizer';
import { useBoardCutOptimizerStore } from 'src/stores/boardCutOptimizer';
import type { BoardCutOptimizerState } from 'src/stores/boardCutOptimizer';
import type { PreparedImport } from 'src/composables/useToolProjects';
import { formatDistanceWithSettings } from 'src/utils/unitParsing';
import DistanceInput from 'src/components/DistanceInput.vue';
import ToolProjectBar from 'src/components/ToolProjectBar.vue';

const $q = useQuasar();
const store = useBoardCutOptimizerStore();
const {
  state,
  projects,
  activeProject,
  displaySettings: dsSettings,
  stockTypeNames,
} = storeToRefs(store);
const {
  switchProject,
  createProject,
  duplicateProject,
  renameProject,
  deleteProject,
  resetCurrentProject,
  exportProject,
  prepareImport,
  completeImport,
  addStockType,
  removeStockType,
  addBoard,
  removeBoard,
  addRequiredPiece,
  removeRequiredPiece,
} = store;

// --- Export / Import ---

function handleExport() {
  const data = exportProject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.projectName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import state
const pendingImport = ref<PreparedImport<BoardCutOptimizerState> | null>(null);
const showImportConflictDialog = ref(false);
const importDialogName = ref('');

const importExistingNames = computed(() => new Set(projects.value.map((p) => p.name)));
const importNameConflict = computed(() => {
  const name = importDialogName.value.trim();
  return name.length > 0 && importExistingNames.value.has(name);
});

function handleImport(json: string) {
  const result = prepareImport(json);
  if ('error' in result) {
    $q.notify({ type: 'negative', message: result.error });
    return;
  }
  if (result.conflictProjectId) {
    // Name conflict — show resolution dialog
    pendingImport.value = result;
    importDialogName.value = result.originalName;
    showImportConflictDialog.value = true;
  } else {
    // No conflict — import directly
    completeImport(result, result.originalName);
    $q.notify({ type: 'positive', message: `Imported project "${result.originalName}"` });
  }
}

function confirmImportReplace() {
  if (!pendingImport.value) return;
  showImportConflictDialog.value = false;
  completeImport(pendingImport.value, pendingImport.value.originalName, pendingImport.value.conflictProjectId);
  $q.notify({ type: 'positive', message: `Replaced project "${pendingImport.value.originalName}"` });
  pendingImport.value = null;
}

function confirmImportRename() {
  const name = importDialogName.value.trim();
  if (!name || importNameConflict.value || !pendingImport.value) return;
  showImportConflictDialog.value = false;
  completeImport(pendingImport.value, name);
  $q.notify({ type: 'positive', message: `Imported project "${name}"` });
  pendingImport.value = null;
}

// --- Display settings options ---

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

const workerClient = new CutOptimizerWorker();
const result = ref<CutOptimizerResult | null>(null);
const isRunning = ref(false);
const elapsedMs = ref(0);
const progress = ref<BnBProgress | null>(null);
const lastStats = ref<BnBStats | null>(null);
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer);
  workerClient.dispose();
});

function buildInput(): CutOptimizerInput | null {
  const k = state.value.kerf;
  const minR = state.value.minUsefulRemnant;
  if (!Number.isFinite(k) || k < 0) return null;
  if (!Number.isFinite(minR) || minR < 0) return null;

  const types: CutOptimizerInput['stockTypes'] = [];
  for (const st of state.value.stockTypes) {
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
  for (const rp of state.value.requiredPieces) {
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

const inputValid = computed(() => buildInput() !== null);

async function calculate() {
  const inp = buildInput();
  if (!inp) return;

  workerClient.cancel();
  isRunning.value = true;
  elapsedMs.value = 0;
  progress.value = null;
  lastStats.value = null;

  const startTime = Date.now();
  elapsedTimer = setInterval(() => {
    elapsedMs.value = Date.now() - startTime;
  }, 100);

  try {
    if (state.value.algorithm === 'ffd') {
      result.value = await workerClient.runFfd(inp);
    } else {
      const { result: r, stats } = await workerClient.runBnB(
        inp,
        {
          scoringParams: { ...state.value.scoringParams },
          timeLimitMs: state.value.bnbTimeLimitMs,
        },
        (p) => {
          progress.value = { ...p };
        },
      );
      result.value = r;
      lastStats.value = stats ?? null;
    }
  } catch (e) {
    if ((e as Error).message !== 'Cancelled') {
      $q.notify({ type: 'negative', message: `Calculation error: ${(e as Error).message}` });
    }
  } finally {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    isRunning.value = false;
  }
}

function cancelCalculation() {
  workerClient.cancel();
}

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
