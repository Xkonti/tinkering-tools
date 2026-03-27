# Tool page layout guide

This documents the UI layout conventions for tool pages. See `BoardCutOptimizerPage.vue` as the reference implementation.

## Page shell

Every tool page follows the same outer structure:

```vue
<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- sections go here as col-12 divs -->
    </div>
  </q-page>
</template>
```

- `q-pa-md` — page-level padding
- `row q-col-gutter-md` — vertical spacing between sections (16px)

## Sections

Sections are separated by `q-separator`, **not** wrapped in `q-card`. Cards waste horizontal space, especially on mobile.

```vue
<div class="col-12">
  <q-separator />
  <div class="text-h6 q-my-md">Section Title</div>
  <!-- section content -->
</div>
```

The first section after the project bar gets a separator too — it visually separates the project bar from the tool content.

## Project bar

Tools that use the project system place `ToolProjectBar` as the first `col-12` child, before any separator. See the root `CLAUDE.md` for full project system docs.

## Responsive form rows

Form inputs in a row use Quasar's 12-column grid with responsive breakpoints. The `row` class wraps by default, so columns exceeding 12 flow to the next line.

```vue
<div class="row items-center q-col-gutter-sm q-mb-sm">
  <div class="col-12 col-sm-5"><!-- primary field --></div>
  <div class="col-5 col-sm-2"><!-- narrow field (quantity, etc.) --></div>
  <div class="col col-sm"><!-- flexible field (name, notes) --></div>
  <div class="col-auto"><!-- action button --></div>
</div>
```

### Key principles

- **Size columns proportionally to content.** A quantity field holding a small number should be narrower than a name or length field.
- **On mobile (`< 600px`), important fields get their own line** via `col-12`. Secondary fields share the next line.
- **On desktop (`>= 600px`), everything fits on one row** with `col-sm-*` sizing.
- **`col`** (no number) acts as flex-grow — it fills remaining space after fixed-width siblings.
- **`col-auto`** for action buttons — takes only the space the button needs.

### Breakpoints

| Prefix | Min width | Typical device |
|--------|-----------|----------------|
| *(none)* | 0 | Mobile phones |
| `col-sm-*` | 600px | Large phones / small tablets |
| `col-md-*` | 1024px | Tablets / small desktops |
| `col-lg-*` | 1440px | Desktops |

### Spacing

- `q-col-gutter-sm` — tight spacing within form rows (8px)
- `q-col-gutter-md` — between sections and settings fields (16px)
- `q-mb-sm` — between repeating form row entries
- `q-mb-md` — between larger groups (e.g., stock types)

## Input styling

All inputs use `outlined` and `dense`:

```vue
<q-input v-model="value" outlined dense label="Label" />
<q-select v-model="value" :options="opts" outlined dense label="Label" emit-value map-options />
```

`DistanceInput` and `UnitInput` accept the same `outlined` and `dense` props.

## Repeating item lists

For lists of user-managed items (boards, pieces, etc.):

1. Each item is a responsive `row` (see form rows above)
2. Spacing between items: `q-mb-sm` on each row
3. Delete/remove button at the end: `col-auto` with `q-btn flat dense round icon="..." color="negative"`
4. "Add" button after the list: `q-btn outline no-caps icon="add" label="Add Thing"`
5. When items have sub-groups (e.g., stock types containing boards), separate groups with `<q-separator class="q-mb-md" />` between them

## Settings / configuration fields

Settings that apply to the whole tool (not per-item) use a wider gutter and flow horizontally on desktop:

```vue
<div class="row q-col-gutter-md items-center">
  <div class="col-6 col-sm-4 col-md-2"><!-- input --></div>
  <div class="col-6 col-sm-4 col-md-2"><!-- input --></div>
  <div class="col-12 col-sm-4 col-md-auto"><!-- toggle --></div>
  <!-- ... -->
</div>
```

`items-center` aligns toggles and selects vertically with input fields.

## Summary / metrics display

For showing computed results:

```vue
<div class="row q-col-gutter-md">
  <div class="col-6 col-md-2">
    <div class="text-subtitle2 text-grey-7">Label</div>
    <div class="text-h5 text-primary">Value</div>
  </div>
</div>
```

Use semantic text colors: `text-primary`, `text-positive`, `text-negative`, `text-warning`.

## Dialogs

Dialogs (import conflicts, confirmations, etc.) keep their `q-card` wrappers — cards are appropriate inside modals:

```vue
<q-dialog v-model="showDialog" persistent>
  <q-card style="min-width: 300px">
    <q-card-section>
      <div class="text-h6">Title</div>
    </q-card-section>
    <q-card-section><!-- content --></q-card-section>
    <q-card-actions align="right">
      <q-btn flat label="Cancel" v-close-popup />
      <q-btn flat label="Confirm" color="primary" @click="handle" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

## Custom CSS

Light custom CSS is fine for things Quasar utilities don't cover (e.g., visualization bars with dynamic `flex-basis`). Avoid recreating or overriding Quasar's grid, spacing, or component styles.
