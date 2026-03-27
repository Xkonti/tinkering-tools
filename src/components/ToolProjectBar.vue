<template>
  <div class="row items-center q-gutter-sm">
    <div class="col">
      <q-select
        :model-value="activeProjectId"
        :options="projectOptions"
        outlined
        dense
        emit-value
        map-options
        label="Project"
        @update:model-value="$emit('switch', $event as string)"
      />
    </div>
    <div class="col-auto">
      <q-btn-dropdown
        flat
        dense
        icon="more_vert"
        no-caps
      >
        <q-list dense>
          <q-item clickable v-close-popup @click="promptNew">
            <q-item-section avatar><q-icon name="add" /></q-item-section>
            <q-item-section>New project</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="promptDuplicate">
            <q-item-section avatar><q-icon name="content_copy" /></q-item-section>
            <q-item-section>Duplicate</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="promptRename">
            <q-item-section avatar><q-icon name="edit" /></q-item-section>
            <q-item-section>Rename</q-item-section>
          </q-item>
          <q-separator />
          <q-item clickable v-close-popup @click="$emit('export')">
            <q-item-section avatar><q-icon name="file_download" /></q-item-section>
            <q-item-section>Export project</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="triggerImport">
            <q-item-section avatar><q-icon name="file_upload" /></q-item-section>
            <q-item-section>Import project</q-item-section>
          </q-item>
          <q-separator />
          <q-item clickable v-close-popup @click="promptReset">
            <q-item-section avatar><q-icon name="restart_alt" /></q-item-section>
            <q-item-section>Reset to defaults</q-item-section>
          </q-item>
          <q-item
            clickable
            v-close-popup
            :disable="projects.length <= 1"
            @click="promptDelete"
          >
            <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
            <q-item-section class="text-negative">Delete project</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>
  </div>

  <!-- New project dialog -->
  <q-dialog v-model="showNewDialog">
    <q-card style="min-width: 300px">
      <q-card-section>
        <div class="text-h6">New Project</div>
      </q-card-section>
      <q-card-section>
        <q-input
          v-model="dialogName"
          outlined
          dense
          label="Project name"
          autofocus
          @keyup.enter="confirmNew"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          flat
          label="Create"
          color="primary"
          :disable="!dialogName.trim()"
          @click="confirmNew"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Duplicate dialog -->
  <q-dialog v-model="showDuplicateDialog">
    <q-card style="min-width: 300px">
      <q-card-section>
        <div class="text-h6">Duplicate Project</div>
      </q-card-section>
      <q-card-section>
        <q-input
          v-model="dialogName"
          outlined
          dense
          label="Project name"
          autofocus
          @keyup.enter="confirmDuplicate"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          flat
          label="Duplicate"
          color="primary"
          :disable="!dialogName.trim()"
          @click="confirmDuplicate"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Rename dialog -->
  <q-dialog v-model="showRenameDialog">
    <q-card style="min-width: 300px">
      <q-card-section>
        <div class="text-h6">Rename Project</div>
      </q-card-section>
      <q-card-section>
        <q-input
          v-model="dialogName"
          outlined
          dense
          label="Project name"
          autofocus
          @keyup.enter="confirmRename"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          flat
          label="Rename"
          color="primary"
          :disable="!dialogName.trim()"
          @click="confirmRename"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Delete confirmation -->
  <q-dialog v-model="showDeleteDialog">
    <q-card style="min-width: 300px">
      <q-card-section>
        <div class="text-h6">Delete Project</div>
      </q-card-section>
      <q-card-section>
        Are you sure you want to delete "{{ activeProjectName }}"? This cannot be undone.
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn flat label="Delete" color="negative" @click="confirmDelete" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Hidden file input for import -->
  <input
    ref="fileInputRef"
    type="file"
    accept=".json"
    style="display: none"
    @change="onFileSelected"
  />

  <!-- Reset confirmation -->
  <q-dialog v-model="showResetDialog">
    <q-card style="min-width: 300px">
      <q-card-section>
        <div class="text-h6">Reset to Defaults</div>
      </q-card-section>
      <q-card-section>
        Reset all inputs in "{{ activeProjectName }}" to their default values? This cannot be undone.
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn flat label="Reset" color="negative" @click="confirmReset" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProjectMeta } from 'src/composables/useToolProjects';

const props = defineProps<{
  projects: ProjectMeta[];
  activeProjectId: string | undefined;
}>();

const emit = defineEmits<{
  (e: 'switch', projectId: string): void;
  (e: 'create', name: string): void;
  (e: 'duplicate', name: string): void;
  (e: 'rename', projectId: string, name: string): void;
  (e: 'delete', projectId: string): void;
  (e: 'reset'): void;
  (e: 'export'): void;
  (e: 'import', json: string): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerImport() {
  fileInputRef.value?.click();
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      emit('import', reader.result);
    }
  };
  reader.readAsText(file);
  // Reset so the same file can be selected again
  input.value = '';
}

const projectOptions = computed(() =>
  props.projects.map((p) => ({ label: p.name, value: p.id })),
);

const activeProjectName = computed(
  () => props.projects.find((p) => p.id === props.activeProjectId)?.name ?? '',
);

// --- Dialog state ---
const dialogName = ref('');

const showNewDialog = ref(false);
const showDuplicateDialog = ref(false);
const showRenameDialog = ref(false);
const showDeleteDialog = ref(false);
const showResetDialog = ref(false);

function promptNew() {
  dialogName.value = '';
  showNewDialog.value = true;
}

function confirmNew() {
  const name = dialogName.value.trim();
  if (!name) return;
  showNewDialog.value = false;
  emit('create', name);
}

function promptDuplicate() {
  dialogName.value = activeProjectName.value + ' (copy)';
  showDuplicateDialog.value = true;
}

function confirmDuplicate() {
  const name = dialogName.value.trim();
  if (!name) return;
  showDuplicateDialog.value = false;
  emit('duplicate', name);
}

function promptRename() {
  dialogName.value = activeProjectName.value;
  showRenameDialog.value = true;
}

function confirmRename() {
  const name = dialogName.value.trim();
  if (!name || !props.activeProjectId) return;
  showRenameDialog.value = false;
  emit('rename', props.activeProjectId, name);
}

function promptDelete() {
  showDeleteDialog.value = true;
}

function confirmDelete() {
  if (!props.activeProjectId) return;
  showDeleteDialog.value = false;
  emit('delete', props.activeProjectId);
}

function promptReset() {
  showResetDialog.value = true;
}

function confirmReset() {
  showResetDialog.value = false;
  emit('reset');
}
</script>
