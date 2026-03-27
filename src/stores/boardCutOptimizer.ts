import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useToolProjects } from 'src/composables/useToolProjects';
import type { DisplaySettings, RoundingStrategy } from 'src/utils/units';

export interface StockTypeInput {
  id: string;
  name: string;
  boards: {
    id: string;
    length: number | null;
    lengthRaw?: string;
    quantity: number | null;
    name: string;
  }[];
}

export interface RequiredPieceInput {
  id: string;
  stockTypeName: string;
  length: number | null;
  lengthRaw?: string;
  quantity: number | null;
  name: string;
}

export interface BoardCutOptimizerState {
  kerf: number;
  kerfRaw: string;
  minUsefulRemnant: number;
  minUsefulRemnantRaw: string;
  stockTypes: StockTypeInput[];
  requiredPieces: RequiredPieceInput[];
  // Display settings (per-project)
  unitSystem: 'imperial' | 'metric';
  metricUnitSymbol: DisplaySettings['metricUnitSymbol'];
  metricResolutionMm: number;
  imperialPrecision: number;
  imperialShowFeet: boolean;
  roundingStrategy: RoundingStrategy;
}

// --- Legacy migration ---

const LEGACY_KEY = 'tinkering-tools:board-cut-optimizer:v2';
const LEGACY_DS_KEY = `${LEGACY_KEY}:displaySettings`;
const LEGACY_OLD_DISPLAY_UNIT_KEY = `${LEGACY_KEY}:displayUnit`;

function migrateLegacyDisplaySettings(): Pick<
  BoardCutOptimizerState,
  'unitSystem' | 'metricUnitSymbol' | 'metricResolutionMm' | 'imperialPrecision' | 'imperialShowFeet' | 'roundingStrategy'
> {
  let unitSystem: 'imperial' | 'metric' = 'imperial';
  let metricUnitSymbol: DisplaySettings['metricUnitSymbol'] = 'cm';
  let metricResolutionMm = 1;
  let imperialPrecision = 32;
  let imperialShowFeet = true;
  let roundingStrategy: RoundingStrategy = 'ceil';

  // Handle very old single-key format
  const oldDisplayUnit = localStorage.getItem(LEGACY_OLD_DISPLAY_UNIT_KEY);
  if (oldDisplayUnit !== null) {
    if (oldDisplayUnit === 'mm' || oldDisplayUnit === 'cm' || oldDisplayUnit === 'dm' || oldDisplayUnit === 'm') {
      unitSystem = 'metric';
      metricUnitSymbol = oldDisplayUnit;
    }
    localStorage.removeItem(LEGACY_OLD_DISPLAY_UNIT_KEY);
  }

  // Read individual display setting keys (overrides the above)
  const storedUnitSystem = localStorage.getItem(`${LEGACY_DS_KEY}:unitSystem`);
  if (storedUnitSystem === 'imperial' || storedUnitSystem === 'metric') {
    unitSystem = storedUnitSystem;
  }

  const storedMetricUnit = localStorage.getItem(`${LEGACY_DS_KEY}:metricUnit`);
  if (storedMetricUnit === 'mm' || storedMetricUnit === 'cm' || storedMetricUnit === 'dm' || storedMetricUnit === 'm') {
    metricUnitSymbol = storedMetricUnit;
  }

  const storedResolution = Number.parseFloat(localStorage.getItem(`${LEGACY_DS_KEY}:metricResolution`) ?? '');
  if (Number.isFinite(storedResolution)) metricResolutionMm = storedResolution;

  const storedPrecision = Number.parseFloat(localStorage.getItem(`${LEGACY_DS_KEY}:imperialPrecision`) ?? '');
  if (Number.isFinite(storedPrecision)) imperialPrecision = storedPrecision;

  const storedShowFeet = localStorage.getItem(`${LEGACY_DS_KEY}:imperialShowFeet`);
  if (storedShowFeet === 'true' || storedShowFeet === 'false') {
    imperialShowFeet = storedShowFeet === 'true';
  }

  const storedRounding = localStorage.getItem(`${LEGACY_DS_KEY}:rounding`);
  if (storedRounding === 'ceil' || storedRounding === 'floor' || storedRounding === 'round') {
    roundingStrategy = storedRounding;
  }

  // Clean up display setting keys
  const dsKeysToRemove = [
    `${LEGACY_DS_KEY}:unitSystem`,
    `${LEGACY_DS_KEY}:metricUnit`,
    `${LEGACY_DS_KEY}:metricResolution`,
    `${LEGACY_DS_KEY}:imperialPrecision`,
    `${LEGACY_DS_KEY}:imperialShowFeet`,
    `${LEGACY_DS_KEY}:rounding`,
  ];
  for (const key of dsKeysToRemove) {
    localStorage.removeItem(key);
  }

  return { unitSystem, metricUnitSymbol, metricResolutionMm, imperialPrecision, imperialShowFeet, roundingStrategy };
}

function migrateLegacyData(): BoardCutOptimizerState | undefined {
  // Check for any legacy data (tool data or display settings)
  const hasToolData = localStorage.getItem(`${LEGACY_KEY}:kerf`) !== null;
  const hasDisplayData =
    localStorage.getItem(`${LEGACY_DS_KEY}:unitSystem`) !== null ||
    localStorage.getItem(LEGACY_OLD_DISPLAY_UNIT_KEY) !== null;

  if (!hasToolData && !hasDisplayData) return undefined;

  // Migrate display settings (always — even if no tool data)
  const ds = migrateLegacyDisplaySettings();

  // Migrate tool data
  const kerfStr = localStorage.getItem(`${LEGACY_KEY}:kerf`);
  const kerf = kerfStr !== null ? (Number.parseFloat(kerfStr) || 3.175) : 3.175;
  const kerfRaw = localStorage.getItem(`${LEGACY_KEY}:kerfRaw`) ?? '';
  const minUsefulRemnant =
    Number.parseFloat(localStorage.getItem(`${LEGACY_KEY}:minUsefulRemnant`) ?? '') || 254;
  const minUsefulRemnantRaw =
    localStorage.getItem(`${LEGACY_KEY}:minUsefulRemnantRaw`) ?? '';

  let stockTypes: StockTypeInput[];
  try {
    stockTypes = JSON.parse(
      localStorage.getItem(`${LEGACY_KEY}:stockTypes`) ?? '[]',
    ) as StockTypeInput[];
  } catch {
    stockTypes = [];
  }

  let requiredPieces: RequiredPieceInput[];
  try {
    requiredPieces = JSON.parse(
      localStorage.getItem(`${LEGACY_KEY}:requiredPieces`) ?? '[]',
    ) as RequiredPieceInput[];
  } catch {
    requiredPieces = [];
  }

  // Clean up old tool data keys
  const keysToRemove = [
    `${LEGACY_KEY}:kerf`,
    `${LEGACY_KEY}:kerfRaw`,
    `${LEGACY_KEY}:minUsefulRemnant`,
    `${LEGACY_KEY}:minUsefulRemnantRaw`,
    `${LEGACY_KEY}:stockTypes`,
    `${LEGACY_KEY}:requiredPieces`,
  ];
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }

  return {
    kerf, kerfRaw, minUsefulRemnant, minUsefulRemnantRaw,
    stockTypes, requiredPieces,
    ...ds,
  };
}

// --- Store ---

function createDefaults(): BoardCutOptimizerState {
  return {
    kerf: 3.175,
    kerfRaw: '',
    minUsefulRemnant: 254,
    minUsefulRemnantRaw: '',
    stockTypes: [
      {
        id: crypto.randomUUID(),
        name: '2x4',
        boards: [{ id: crypto.randomUUID(), length: 2438.4, quantity: 10, name: '' }],
      },
    ],
    requiredPieces: [
      {
        id: crypto.randomUUID(),
        stockTypeName: '2x4',
        length: 609.6,
        quantity: 10,
        name: '',
      },
    ],
    unitSystem: 'imperial',
    metricUnitSymbol: 'cm',
    metricResolutionMm: 1,
    imperialPrecision: 32,
    imperialShowFeet: true,
    roundingStrategy: 'ceil',
  };
}

export const useBoardCutOptimizerStore = defineStore(
  'boardCutOptimizer',
  () => {
    const {
      state,
      projects,
      activeProject,
      switchProject,
      createProject: rawCreateProject,
      duplicateProject,
      renameProject,
      deleteProject,
      resetCurrentProject,
    } = useToolProjects<BoardCutOptimizerState>({
      toolId: 'board-cut-optimizer',
      defaults: createDefaults,
      migrate: migrateLegacyData,
    });

    // When creating a new project, carry over display settings from the current project
    function createProject(name: string): string {
      const defaults = createDefaults();
      return rawCreateProject(name, {
        ...defaults,
        unitSystem: state.value.unitSystem,
        metricUnitSymbol: state.value.metricUnitSymbol,
        metricResolutionMm: state.value.metricResolutionMm,
        imperialPrecision: state.value.imperialPrecision,
        imperialShowFeet: state.value.imperialShowFeet,
        roundingStrategy: state.value.roundingStrategy,
      });
    }

    // Computed DisplaySettings object for components that need it
    const displaySettings = computed<DisplaySettings>(() => ({
      unitSystem: state.value.unitSystem,
      metricUnitSymbol: state.value.metricUnitSymbol,
      metricResolutionMm: state.value.metricResolutionMm,
      imperialPrecision: state.value.imperialPrecision,
      imperialShowFeet: state.value.imperialShowFeet,
      roundingStrategy: state.value.roundingStrategy,
    }));

    const stockTypeNames = computed(() =>
      state.value.stockTypes.map((s) => s.name).filter((n) => n.length > 0),
    );

    function addStockType() {
      state.value.stockTypes.push({
        id: crypto.randomUUID(),
        name: '',
        boards: [{ id: crypto.randomUUID(), length: null, quantity: null, name: '' }],
      });
    }

    function removeStockType(id: string) {
      state.value.stockTypes = state.value.stockTypes.filter((s) => s.id !== id);
    }

    function addBoard(st: StockTypeInput) {
      st.boards.push({
        id: crypto.randomUUID(),
        length: null,
        quantity: null,
        name: '',
      });
    }

    function removeBoard(st: StockTypeInput, boardId: string) {
      st.boards = st.boards.filter((b) => b.id !== boardId);
    }

    function addRequiredPiece() {
      state.value.requiredPieces.push({
        id: crypto.randomUUID(),
        stockTypeName: stockTypeNames.value[0] ?? '',
        length: null,
        quantity: null,
        name: '',
      });
    }

    function removeRequiredPiece(id: string) {
      state.value.requiredPieces = state.value.requiredPieces.filter(
        (p) => p.id !== id,
      );
    }

    return {
      state,
      projects,
      activeProject,
      displaySettings,
      switchProject,
      createProject,
      duplicateProject,
      renameProject,
      deleteProject,
      resetCurrentProject,
      stockTypeNames,
      addStockType,
      removeStockType,
      addBoard,
      removeBoard,
      addRequiredPiece,
      removeRequiredPiece,
    };
  },
);
