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
bun run lint         # lint
bun run format       # format
```

## Routing

The app uses Vue Router in **history mode** (no `#` in URLs).
