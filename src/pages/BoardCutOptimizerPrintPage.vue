<template>
  <q-page class="print-page q-pa-md">
    <template v-if="result">
      <!-- Header -->
      <div v-if="projectName" class="project-name">{{ projectName }}</div>

      <!-- Unfulfilled warning -->
      <div v-if="result.unfulfilled.length > 0" class="unfulfilled">
        <strong>Unfulfilled:</strong>
        <span v-for="(uf, idx) in result.unfulfilled" :key="idx">
          {{ idx > 0 ? ', ' : '' }}{{ uf.quantity }}&times;
          {{ fmtDist(uf.length) }} {{ uf.stockTypeName }}{{ uf.name ? ' (' + uf.name + ')' : '' }}
        </span>
      </div>

      <!-- Cut Patterns by Type -->
      <div
        v-for="[typeName, patterns] in sortedPatterns"
        :key="typeName"
        class="type-section"
      >
        <div class="type-header">{{ typeName }}</div>

        <div class="boards-grid">
          <div
            v-for="(pattern, pIdx) in patterns"
            :key="pIdx"
            class="board-card"
          >
            <div class="board-header">
              #{{ pIdx + 1 }}
              ({{ fmtDist(pattern.stockBoard.length) }}){{
                pattern.stockBoard.name
                  ? ' ' + pattern.stockBoard.name
                  : ''
              }}
            </div>
            <div
              v-for="(piece, pieceIdx) in pattern.pieces"
              :key="pieceIdx"
              class="piece-row"
            >
              <span class="checkbox" />
              <span class="piece-length">{{ fmtDist(piece.length) }}</span>
              <span v-if="piece.name" class="piece-name">{{ piece.name }}</span>
            </div>
            <div v-if="pattern.remainderIsUsable" class="remainder-row">
              {{ fmtDist(pattern.remainder) }} usable
            </div>
          </div>
        </div>
      </div>

      <!-- Print button (hidden when printing) -->
      <div class="print-controls no-print">
        <q-btn
          color="primary"
          icon="print"
          label="Print"
          no-caps
          @click="printPage"
        />
        <q-btn
          flat
          no-caps
          label="Back"
          icon="arrow_back"
          class="q-ml-sm"
          @click="goBack"
        />
      </div>
    </template>

    <div v-else class="no-result">
      <p>No results available. Run a calculation first, then click "Print Results".</p>
      <q-btn flat no-caps label="Back" icon="arrow_back" @click="goBack" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useBoardCutOptimizerStore } from 'src/stores/boardCutOptimizer';
import type { CutPattern } from 'src/utils/boardCutOptimizer';
import { formatDistanceWithSettings } from 'src/utils/unitParsing';

const router = useRouter();
const store = useBoardCutOptimizerStore();
const { lastResult: result, activeProject, displaySettings: dsSettings } =
  storeToRefs(store);

const projectName = computed(() => activeProject.value?.name ?? '');

const sortedPatterns = computed<[string, CutPattern[]][]>(() => {
  if (!result.value) return [];
  return Object.entries(result.value.patternsByType).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
});

function fmtDist(mm: number): string {
  return formatDistanceWithSettings(mm, dsSettings.value);
}

function printPage() {
  window.print();
}

function goBack() {
  void router.push('/woodworking/board-cut-optimizer');
}
</script>

<style scoped>
.print-page {
  max-width: 800px;
  margin: 0 auto;
  font-family: 'Courier New', Courier, monospace;
  color: #000;
  font-size: 0.8rem;
}

.project-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 6px 0;
}

.unfulfilled {
  margin-bottom: 6px;
  color: #900;
}

.type-header {
  font-size: 0.9rem;
  font-weight: 700;
  border-bottom: 1px solid #000;
  margin: 8px 0 4px 0;
  padding-bottom: 1px;
}

.boards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 16px;
}

.board-card {
  break-inside: avoid;
  padding: 2px 0;
}

.board-header {
  font-weight: 600;
  font-size: 0.8rem;
  margin: 0 0 0 0;
  line-height: 1.4;
}

.piece-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1.3;
  padding-left: 2px;
}

.checkbox {
  display: inline-block;
  width: 9px;
  height: 9px;
  min-width: 9px;
  border: 1.5px solid #000;
  position: relative;
  top: 1px;
}

.piece-length {
  text-align: right;
  white-space: nowrap;
  min-width: 5em;
  font-weight: 500;
}

.piece-name {
  color: #444;
}

.remainder-row {
  padding-left: 15px;
  font-style: italic;
  color: #666;
  font-size: 0.75rem;
  line-height: 1.3;
}

.no-result {
  text-align: center;
  padding: 48px 0;
  color: #666;
}

.print-controls {
  text-align: center;
  margin-top: 16px;
}

@media print {
  .no-print {
    display: none !important;
  }

  .print-page {
    max-width: none;
    padding: 0 !important;
    font-size: 9pt;
  }

  .project-name {
    font-size: 11pt;
  }

  .type-header {
    font-size: 10pt;
  }

  .board-header {
    font-size: 9pt;
  }

  .board-card {
    break-inside: avoid;
  }
}
</style>
