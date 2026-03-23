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

## Code conventions

- ESLint enforces `consistent-type-imports` — always use `import type { ... }` for type-only imports
- Quasar components are auto-imported; custom components need explicit imports in `<script setup>`
- TypeScript strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` enabled
- No custom CSS — use Quasar utility classes (`q-pa-md`, `row`, `col-*`, `text-*`, etc.) and component props
