import { useLocalStorage } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';

// --- Types ---

export interface ProjectMeta {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ToolProjectExport {
  readonly toolId: string;
  readonly toolVersion: number;
  readonly projectName: string;
  readonly exportedAt: number;
  readonly state: unknown;
}

export interface UseToolProjectsOptions<T> {
  /** Unique tool identifier used in localStorage keys, e.g. 'board-cut-optimizer'. */
  toolId: string;
  /** Current version of the tool's state format. Written into exports. */
  currentVersion: number;
  /**
   * Map from version number to a function that transforms that version's raw state
   * into the current state shape. Must include an entry for `currentVersion`.
   * Older version importers handle migration from previous state shapes.
   */
  importers: Record<number, (rawState: unknown) => T>;
  /** Factory returning the default state for a new project. */
  defaults: () => T;
  /**
   * Optional one-time migration from legacy localStorage keys.
   * Called on first load when no projects exist yet.
   * Should read old keys, return state for a "Default" project, and clean up old keys.
   * Return undefined to skip migration and use defaults instead.
   */
  migrate?: () => T | undefined;
}

export interface UseToolProjectsReturn<T> {
  /** Deeply reactive state for the active project. */
  state: Ref<T>;
  /** All projects for this tool. */
  projects: Ref<ProjectMeta[]>;
  /** Metadata for the currently active project. */
  activeProject: ComputedRef<ProjectMeta | undefined>;
  /** Switch to a different project by ID. */
  switchProject: (projectId: string) => void;
  /** Create a new project. Uses initialState if provided, otherwise defaults. Switches to it. Returns the new ID. */
  createProject: (name: string, initialState?: T) => string;
  /** Duplicate the active project with a new name. Switches to the copy. Returns the new ID. */
  duplicateProject: (name: string) => string;
  /** Rename a project. */
  renameProject: (projectId: string, newName: string) => void;
  /** Delete a project. Switches to another if it was active. Cannot delete the last project. */
  deleteProject: (projectId: string) => void;
  /** Reset the active project's state to defaults. */
  resetCurrentProject: () => void;
  /** Export the active project as a versioned export object. */
  exportProject: () => ToolProjectExport;
  /** Import a project from a JSON string. Returns the project name on success or an error message. */
  importProject: (json: string) => { projectName: string } | { error: string };
}

// --- Helpers ---

function storageKeyProjects(toolId: string): string {
  return `tt:${toolId}:projects`;
}

function storageKeyActive(toolId: string): string {
  return `tt:${toolId}:active`;
}

function storageKeyProjectState(toolId: string, projectId: string): string {
  return `tt:${toolId}:project:${projectId}`;
}

function loadProjectState<T>(toolId: string, projectId: string, fallback: T): T {
  const raw = localStorage.getItem(storageKeyProjectState(toolId, projectId));
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveProjectState<T>(toolId: string, projectId: string, state: T): void {
  localStorage.setItem(storageKeyProjectState(toolId, projectId), JSON.stringify(state));
}

function removeProjectState(toolId: string, projectId: string): void {
  localStorage.removeItem(storageKeyProjectState(toolId, projectId));
}

function makeProjectMeta(name: string): ProjectMeta {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// --- Composable ---

export function useToolProjects<T>(
  options: UseToolProjectsOptions<T>,
): UseToolProjectsReturn<T> {
  const { toolId, currentVersion, importers, defaults, migrate } = options;

  // --- Project list and active ID (persisted via useLocalStorage) ---
  const projects = useLocalStorage<ProjectMeta[]>(storageKeyProjects(toolId), []);
  const activeId = useLocalStorage<string>(storageKeyActive(toolId), '');

  // --- Initialization ---
  if (projects.value.length === 0) {
    // No projects yet — try migration, else create Default
    let initialState: T | undefined;
    if (migrate) {
      initialState = migrate();
    }
    if (initialState === undefined) {
      initialState = defaults();
    }
    const meta = makeProjectMeta('Default');
    projects.value = [meta];
    activeId.value = meta.id;
    saveProjectState(toolId, meta.id, initialState);
  }

  // Ensure activeId points to a valid project
  const activeExists = projects.value.some((p) => p.id === activeId.value);
  if (!activeExists && projects.value.length > 0) {
    activeId.value = projects.value[0]!.id;
  }

  // --- Reactive state ---
  const state = ref<T>(
    loadProjectState(toolId, activeId.value, defaults()),
  ) as Ref<T>;

  // Persist state changes to localStorage
  let suppressWatch = false;

  watch(
    state,
    (newState) => {
      if (suppressWatch) return;
      saveProjectState(toolId, activeId.value, newState);
      // Update the updatedAt timestamp
      const idx = projects.value.findIndex((p) => p.id === activeId.value);
      if (idx >= 0) {
        const proj = projects.value[idx]!;
        projects.value[idx] = { ...proj, updatedAt: Date.now() };
      }
    },
    { deep: true },
  );

  // --- Computed ---
  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeId.value),
  );

  // --- Actions ---

  function switchProject(projectId: string): void {
    if (projectId === activeId.value) return;
    const target = projects.value.find((p) => p.id === projectId);
    if (!target) return;

    // Save current state before switching
    saveProjectState(toolId, activeId.value, state.value);

    activeId.value = projectId;

    // Load new state (suppress the watcher to avoid re-saving while loading)
    suppressWatch = true;
    state.value = loadProjectState(toolId, projectId, defaults());
    suppressWatch = false;
  }

  function createProject(name: string, initialState?: T): string {
    const meta = makeProjectMeta(name);
    const newState = initialState ?? defaults();
    projects.value = [...projects.value, meta];
    saveProjectState(toolId, meta.id, newState);

    // Switch to the new project
    saveProjectState(toolId, activeId.value, state.value);
    activeId.value = meta.id;
    suppressWatch = true;
    state.value = newState;
    suppressWatch = false;

    return meta.id;
  }

  function duplicateProject(name: string): string {
    const meta = makeProjectMeta(name);
    // Deep clone current state via JSON round-trip
    const cloned = JSON.parse(JSON.stringify(state.value)) as T;
    projects.value = [...projects.value, meta];
    saveProjectState(toolId, meta.id, cloned);

    // Switch to the copy
    saveProjectState(toolId, activeId.value, state.value);
    activeId.value = meta.id;
    suppressWatch = true;
    state.value = cloned;
    suppressWatch = false;

    return meta.id;
  }

  function renameProject(projectId: string, newName: string): void {
    const idx = projects.value.findIndex((p) => p.id === projectId);
    if (idx < 0) return;
    const proj = projects.value[idx]!;
    projects.value[idx] = { ...proj, name: newName, updatedAt: Date.now() };
    // Trigger reactivity by replacing the array
    projects.value = [...projects.value];
  }

  function deleteProject(projectId: string): void {
    if (projects.value.length <= 1) return;
    removeProjectState(toolId, projectId);
    projects.value = projects.value.filter((p) => p.id !== projectId);

    // If we deleted the active project, switch to the first remaining one
    if (projectId === activeId.value && projects.value.length > 0) {
      const newActive = projects.value[0]!;
      activeId.value = newActive.id;
      suppressWatch = true;
      state.value = loadProjectState(toolId, newActive.id, defaults());
      suppressWatch = false;
    }
  }

  function resetCurrentProject(): void {
    state.value = defaults();
  }

  function exportProject(): ToolProjectExport {
    return {
      toolId,
      toolVersion: currentVersion,
      projectName: activeProject.value?.name ?? 'Unnamed',
      exportedAt: Date.now(),
      state: JSON.parse(JSON.stringify(state.value)) as unknown,
    };
  }

  function importProject(json: string): { projectName: string } | { error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { error: 'Invalid JSON file.' };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { error: 'Invalid file format.' };
    }

    const data = parsed as Record<string, unknown>;

    if (data['toolId'] !== toolId) {
      return { error: `This file is from a different tool ("${String(data['toolId'])}").` };
    }

    const version = data['toolVersion'];
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      return { error: 'Invalid version number in file.' };
    }

    const importer = importers[version];
    if (!importer) {
      if (version > currentVersion) {
        return { error: `This file is from a newer version (v${String(version)}). Please update the app.` };
      }
      return { error: `This file version (v${String(version)}) is too old to import.` };
    }

    let importedState: T;
    try {
      importedState = importer(data['state']);
    } catch {
      return { error: 'Failed to read project data from file.' };
    }

    const projectName = typeof data['projectName'] === 'string' && data['projectName'].length > 0
      ? data['projectName']
      : 'Imported';

    createProject(projectName, importedState);
    return { projectName };
  }

  return {
    state,
    projects,
    activeProject,
    switchProject,
    createProject,
    duplicateProject,
    renameProject,
    deleteProject,
    resetCurrentProject,
    exportProject,
    importProject,
  };
}
