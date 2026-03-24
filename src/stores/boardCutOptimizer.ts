import { useLocalStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed } from 'vue';

export interface StockTypeInput {
  id: string;
  name: string;
  boards: {
    id: string;
    length: number | null;
    quantity: number | null;
    name: string;
  }[];
}

export interface RequiredPieceInput {
  id: string;
  stockTypeName: string;
  length: number | null;
  quantity: number | null;
  name: string;
}

const STORAGE_KEY = 'tinkering-tools:board-cut-optimizer';

export const useBoardCutOptimizerStore = defineStore(
  'boardCutOptimizer',
  () => {
    const kerf = useLocalStorage<number>(`${STORAGE_KEY}:kerf`, 0.125);
    const minUsefulRemnant = useLocalStorage<number>(
      `${STORAGE_KEY}:minUsefulRemnant`,
      10,
    );

    const stockTypes = useLocalStorage<StockTypeInput[]>(
      `${STORAGE_KEY}:stockTypes`,
      [
        {
          id: crypto.randomUUID(),
          name: '2x4',
          boards: [{ id: crypto.randomUUID(), length: 96, quantity: 10, name: '' }],
        },
      ],
    );

    const requiredPieces = useLocalStorage<RequiredPieceInput[]>(
      `${STORAGE_KEY}:requiredPieces`,
      [
        {
          id: crypto.randomUUID(),
          stockTypeName: '2x4',
          length: 24,
          quantity: 10,
          name: '',
        },
      ],
    );

    const stockTypeNames = computed(() =>
      stockTypes.value.map((s) => s.name).filter((n) => n.length > 0),
    );

    function addStockType() {
      stockTypes.value.push({
        id: crypto.randomUUID(),
        name: '',
        boards: [{ id: crypto.randomUUID(), length: null, quantity: null, name: '' }],
      });
    }

    function removeStockType(id: string) {
      stockTypes.value = stockTypes.value.filter((s) => s.id !== id);
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
      requiredPieces.value.push({
        id: crypto.randomUUID(),
        stockTypeName: stockTypeNames.value[0] ?? '',
        length: null,
        quantity: null,
        name: '',
      });
    }

    function removeRequiredPiece(id: string) {
      requiredPieces.value = requiredPieces.value.filter(
        (p) => p.id !== id,
      );
    }

    return {
      kerf,
      minUsefulRemnant,
      stockTypes,
      requiredPieces,
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
