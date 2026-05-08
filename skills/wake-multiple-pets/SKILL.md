---
name: wake-multiple-pets
description: Wake, validate, and run multiple already-installed Codex digital pets at the same time. Use when the user asks to spawn, wake, run, show, or animate more than one existing pet, pets alongside each other, pet swarms, paired companions, or multiple custom pets moving around the screen as separate entities rather than being combined into one spritesheet. Do not use to create new pet art or package new pet spritesheets.
---

# Wake Multiple Pets

## Overview

Use this skill when the user wants separate already-installed pets to appear at the same time, not one combined sprite. This skill validates existing pet packages and chooses or builds a runtime that displays multiple independent pets.

Hard rules:

- Do not create new pets, generate new pet art, repair spritesheets, or package new pet assets. Use `$hatch-pet` for that work.
- Do not satisfy "multiple pets" by merging characters into the same 8x9 atlas unless the user explicitly asks for a single paired pet.
- Separate pets must remain separate folders under `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/`.
- If a requested pet is missing or invalid, stop and tell the user which pet needs `$hatch-pet` first.

## What Codex Supports

The current Codex app discovers custom pets from:

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

The built-in pet overlay reads one selected pet at a time through the avatar overlay path. For multiple simultaneous pets, use one of these approaches:

1. **Package-only**: validate requested pets and tell the user they are available as separate selectable pets.
2. **External native multi-pet overlay**: create or update a small local overlay app that loads several pet folders and animates them in frameless always-on-top transparent windows or a transparent full-screen overlay.
3. **App/plugin patch**: if working inside the Codex app source or a plugin environment that owns the overlay, extend the overlay manager to support multiple selected `custom:<pet-id>` avatars.

Prefer approach 2 when the user says they want them "hatched and moving around the screen" and no app source patch target is available.

## Workflow

1. Identify the pet roster.
   - Use only existing installed pets.
   - Map user names to folder names under `${CODEX_HOME:-$HOME/.codex}/pets`.
   - If a pet is missing or broken, report that it must be created or repaired with `$hatch-pet`; do not do that inside this skill.
   - Keep each pet as its own package; do not combine atlases.

2. Validate every pet package.
   - Run `scripts/list_custom_pets.py` to inspect installed packages.
   - Confirm each selected pet has a valid `pet.json`.
   - Confirm each spritesheet is PNG or WebP, transparent-capable, and `1536x1872`.

3. Choose a runtime.
   - If the user only asked whether the pets exist or can be woken, stop after package validation.
   - If the user asked for multiple pets moving around, create or update a local overlay launcher in the current workspace unless a better existing overlay exists.
   - Keep the overlay separate from `${CODEX_HOME}/pets`; pet folders are assets, not runtime code.
- If a compatible multi-pet overlay is already running, do not start a second overlay window. Re-run the existing launcher with the requested pet ids so the live overlay adds any missing pets.
   - Prefer the project launcher at `/Users/pjuguilon/Documents/Codex/personal/pets-overlay/app` when available.

4. Launch and verify.
   - Start the overlay or app process.
   - Verify each pet appears as a separate moving entity.
   - Report the pet folders, launcher path, and how to stop/restart it.

## External Overlay Guidance

For a quick local implementation, build a small Electron/Tauri/native-webview overlay that behaves like the built-in `/pet` overlay. Do not use a normal browser tab as the final runtime.

- Loads each pet's `pet.json` and `spritesheet.webp`.
- Accepts pet ids as launch arguments, for example `--pets koji palkia` or `--pets koji,palkia`.
- Uses a single-instance lock or equivalent IPC channel so later launches add requested pets to the existing overlay.
- Includes a configuration window (`npm run config`) for waking/despawning pets and adjusting overlay behavior.
- Treats each pet as an independent actor with its own position, velocity, current row, and frame index.
- Uses the Codex atlas contract: 8 columns, 9 rows, 192x208 cells, total `1536x1872`.
- Animates with CSS `background-position` or canvas cropping; do not rewrite pet art.
- Keeps each pet draggable if feasible.
- Gives each pet a separate z-index and collision/bounds behavior.
- Uses a frameless transparent native window.
- Sets the window always on top and visible on all workspaces; on macOS also request visibility on fullscreen spaces when supported.
- Avoids normal browser chrome, tabs, address bars, and webpage framing.
- Avoids speech bubbles or interactions unless the user asks for them.

Browser pages are useful only for preview/debugging. If the user asks for pets "overlaid everywhere" or "same as /pet", launch a native overlay window.

## References

Read [references/runtime-notes.md](references/runtime-notes.md) when implementing or patching a multi-pet overlay.

Use `$hatch-pet` only as a handoff recommendation when a requested pet does not already exist or fails package validation.
