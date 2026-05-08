---
name: wake-pets
description: Wake, validate, run, and manage already-installed Codex digital pets in the bundled native desktop overlay. Use when the user asks to spawn, wake, show, run, configure, despawn, resize, or animate one or more existing pets. Do not use to create new pet art or package new pet spritesheets.
---

# Wake Pets

## Scope

- Use only already-installed pet ids from `${CODEX_HOME:-$HOME/.codex}/pets`.
- Do not create pets, generate art, repair spritesheets, or combine pets into one spritesheet.
- If a requested pet is missing or invalid, tell the user to create or repair it with `$hatch-pet` first.

## Setup

Run from this skill directory. Install overlay dependencies once:

```bash
scripts/setup_overlay.sh
```

The launcher also runs setup automatically if Electron is missing.

## Validate Pets

List installed pets and validation status:

```bash
scripts/list_custom_pets.py
```

## Wake Pets

Wake one or more pets:

```bash
scripts/run_overlay.sh --pets koji jack nabi
```

If the overlay is already running, run the same command with additional pet ids to add missing pets to the live overlay.

Wake pets and open config:

```bash
scripts/run_overlay.sh --config --pets koji jack nabi
```

## Open Config

Open or focus the configuration window:

```bash
scripts/run_overlay.sh --config
```

Config can wake/despawn pets, toggle movement/collisions, show or hide names, change movement speed, change idle animation speed, and resize running pets.

## Pet Controls

- Drag a pet to move it.
- New pets start stopped by default.
- Dragged pets show running left/right frames while being moved.
- Drop gently to keep a pet stopped in place.
- Throw with a fast release to make a pet continue moving.
- Right-click a pet to stop it and open its menu.

Right-click menu options:

- `Smaller`
- `Larger`
- `Reset size`
- `Open Config`
- `Despawn pet`

## Stop Overlay

Use config `Despawn All`, despawn each pet, or stop the process:

```bash
pkill -f 'wake-pets/app|pets-overlay/app'
```
