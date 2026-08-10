# Multi-Pet Runtime Notes

## Discovered Codex Pet Behavior

Codex custom pet packages live under:

```text
${CODEX_HOME:-$HOME/.codex}/pets/<folder>/
  pet.json
  spritesheet.webp
```

`pet.json` shape:

```json
{
  "id": "pet-id",
  "displayName": "Pet Name",
  "description": "One short sentence.",
  "spritesheetPath": "spritesheet.webp"
}
```

The app loads custom pets by folder and exposes ids internally as `custom:<folder>`. The folder name is the stable selector, so changing only `pet.json.id` is not enough to create a second installed pet.

The app validates both supported atlas formats. v1 is `1536x1872`, an `8 x 9` atlas of `192x208` cells. v2 uses `spriteVersionNumber: 2` and is `1536x2288`, an `8 x 11` atlas of the same `192x208` cells. PNG and WebP are accepted.

Current app code uses one avatar overlay manager with open/tuck/drag messages such as:

- `avatar-overlay-open`
- `avatar-overlay-open-state-request`
- `avatar-overlay-drag-start`
- `avatar-overlay-drag-move`
- `avatar-overlay-drag-end`
- `avatar-overlay-drag-release`
- `avatar-overlay-element-size-changed`

That means separate simultaneous pets require a new multi-actor runtime or an app/plugin change. A combined atlas is visually possible but semantically wrong when the user asked for different pets.

This skill is runtime-only. If a pet package is missing, invalid, or needs new art, hand off to `$hatch-pet`; do not generate or repair pet spritesheets here.

## Native Overlay Window Requirements

The built-in `/pet` path is not a website. It creates a native Electron `BrowserWindow` on the `/avatar-overlay` route with these important traits:

- frameless app-owned overlay window
- always on top using a floating window level
- visible on all workspaces
- visible on fullscreen spaces on macOS where supported
- menu bar hidden
- transparent/non-page-like presentation
- draggable mascot behavior handled by overlay messages

For external runtimes, mirror those traits as closely as possible. A normal browser tab is not an acceptable final result for "wake pets" unless the user explicitly asks for a browser preview.

## Re-running the Skill

The multi-pet overlay should behave like one persistent pet layer. If it is already running and the skill is executed again with more pet names, use the same launcher/IPC path to add those pets to the existing overlay. Do not create a second transparent full-screen window.

Recommended behavior:

- First launch starts the native overlay and wakes all requested pets.
- Later launches with `--pets <id...>` or an equivalent command send the selected pet ids to the existing overlay process.
- Pets already present should not be duplicated unless the user explicitly asks for duplicates.
- A despawned pet may be added again by re-running the skill with that pet id.

User-facing slash command contract:

```text
/wake-pets koji, nabi -> open the overlay with koji and nabi
/wake-pets jack -> open the overlay if needed, otherwise add jack to the existing overlay
/wake-pets config -> open or focus the configuration window
/wake-pets stop -> close the overlay app process
```

The local helper mirrors that contract with `scripts/run_overlay.sh koji, nabi`, `scripts/run_overlay.sh jack`, `scripts/run_overlay.sh config`, and `scripts/run_overlay.sh stop`.

## Overlay Implementation Shape

Represent each pet independently:

```js
{
  id,
  displayName,
  imageUrl,
  x,
  y,
  vx,
  vy,
  row,
  frame,
  frameMs
}
```

Recommended row assumptions unless a stronger local contract exists:

- Row count: 9 for v1, 11 for v2.
- Column count: 8.
- Cell size: `192x208`.
- Idle and walking/running rows should be enough for roaming.
- Leave unused frames transparent.

Use CSS or canvas:

```css
.pet {
  width: 192px;
  height: 208px;
  background-size: 1536px 1872px; /* v1; v2 uses 1536px 2288px */
  background-repeat: no-repeat;
}
```

Advance frames by setting:

```text
background-position: -<frame * 192>px -<row * 208>px
```

For screen movement:

- Clamp or bounce at viewport edges.
- Flip horizontally only as display transform for direction; do not edit the source atlas.
- Randomize each pet's phase, position, and velocity so they do not march in lockstep.
- Keep all runtime state outside pet package folders.

## Validation Checklist

- Each pet remains its own folder under `${CODEX_HOME}/pets`.
- No generated "multi-pet" asset overwrites a source pet.
- No new pet art or pet package is created by this skill.
- Every selected pet has a valid atlas size.
- At least two distinct pet actors render at the same time.
- Actors move independently and remain inside the visible screen or app viewport.
- The final answer names the launcher process/window and stop command when applicable.
