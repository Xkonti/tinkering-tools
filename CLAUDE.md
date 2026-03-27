# Tinkering Tools

A single-page application (SPA) providing a collection of in-browser tools for day-to-day tinkering across various hobbies and disciplines.

## Planned tools

- **Electronics calculators** - Ohm's law, capacitor selection, common component value tables
- **Woodworking cut list optimizer** - given a list of required pieces and available materials, compute optimal cuts to minimize waste (similar to MaxCut)
- **Programmer utilities** - cheatsheets, UUID generators, and other quick-reference tools

## Tech stack

- **Quasar Framework** (v2) with Vite
- **Vue 3.5** using Composition API with `<script setup lang="ts">` blocks
- **TypeScript**
- **Pinia** (v3) for state management using composition-style stores (setup function syntax)
- **Bun** as the package manager and runtime

## Development

```bash
bun install          # install dependencies
bun run dev          # start dev server
bun run build        # production build
bun run typecheck    # type-check (vue-tsc)
bun run lint         # lint
bun run format       # format
```

Before finishing a task, always run `bun run typecheck` and `bun run lint` to verify correctness.

## Routing

The app uses Vue Router in **history mode** (no `#` in URLs).
Route meta is typed via `src/router/route-meta.d.ts` — no need to cast `route.meta` fields.

## Architecture

- Tool registry in `src/data/tools.ts` defines all categories and tools — used by both sidebar nav and index page
- Sidebar nav components: `ToolCategoryNav.vue` (accordion) and `ToolEntryNav.vue` (nav item)
- Tool pages live in `src/pages/` and are added as children of the MainLayout route in `src/router/routes.ts`

## Project system (per-tool state persistence)

Tools that need persistent user data use the `useToolProjects<T>()` composable (`src/composables/useToolProjects.ts`). It provides:

- **Single-blob storage** — entire tool state is one JSON object in localStorage per project
- **Named projects** — users can create, duplicate, rename, delete, and switch between projects
- **Versioned export/import** — projects export to JSON files with a version number and can be imported back

### Key files

| File | Purpose |
|------|---------|
| `src/composables/useToolProjects.ts` | Core composable — state persistence, project CRUD, export/import |
| `src/components/ToolProjectBar.vue` | Reusable UI bar — project picker + actions menu (placed in tool pages) |

### localStorage key scheme

```
tt:{toolId}:projects          → ProjectMeta[]
tt:{toolId}:active            → string (active project ID)
tt:{toolId}:project:{id}      → T (full state blob)
```

### Adding the project system to a new tool

1. **Define the state interface** in the tool's store (`src/stores/myTool.ts`):
   ```typescript
   interface MyToolState { /* all fields the tool persists per project */ }
   ```

2. **Call `useToolProjects`** in the Pinia store setup function:
   ```typescript
   const { state, projects, activeProject, ...actions } = useToolProjects<MyToolState>({
     toolId: 'my-tool',
     currentVersion: 1,
     importers: { 1: (raw) => raw as MyToolState },
     defaults: () => ({ /* default values */ }),
   });
   ```

3. **Add `ToolProjectBar`** to the tool page template and wire events:
   ```vue
   <ToolProjectBar :projects="projects" :active-project-id="activeProject?.id"
     @switch="switchProject" @create="createProject" @duplicate="duplicateProject"
     @rename="renameProject" @delete="deleteProject" @reset="resetCurrentProject"
     @export="handleExport" @import="handleImport" />
   ```

4. **Handle export/import** in the page script (file download + notification on import result).

### Versioning: how to bump a tool's state version

When a tool's state shape changes (fields added, renamed, or removed):

1. **Bump `currentVersion`** (e.g., `1` → `2`)
2. **Add a new importer** for the new version (identity: `(raw) => raw as MyToolState`)
3. **Update the old version's importer** to transform the old shape into the new one:
   ```typescript
   importers: {
     1: (raw) => {
       const v1 = raw as MyToolStateV1;
       return { ...v1, newField: 'default' };  // fill in new/changed fields
     },
     2: (raw) => raw as MyToolState,
   }
   ```
4. **Keep the last 5 versions** of importers. Drop older ones when adding new versions.

### Export file format

```json
{
  "toolId": "my-tool",
  "toolVersion": 1,
  "projectName": "My Project",
  "exportedAt": 1711440000000,
  "state": { ... }
}
```

On import, the composable validates `toolId`, looks up the version's importer, transforms the state, and creates a new project. Mismatched tool IDs, unknown versions, and corrupt files produce user-friendly error messages.

## Code conventions

- ESLint enforces `consistent-type-imports` — always use `import type { ... }` for type-only imports
- Quasar components are auto-imported; custom components need explicit imports in `<script setup>`
- TypeScript strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` enabled
- No custom CSS — use Quasar utility classes (`q-pa-md`, `row`, `col-*`, `text-*`, etc.) and component props
