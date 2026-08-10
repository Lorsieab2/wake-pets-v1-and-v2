---
name: wake-pets
description: Wake, validate, run, and manage already-installed Codex digital pets in the bundled native desktop overlay, supporting legacy v1 and v2 sprite atlases. Use when the user asks to spawn, wake, show, run, configure, despawn, resize, or animate one or more existing pets. Do not use to create new pet art or package new pet spritesheets.
---

# Wake Pets v1 and v2

## Scope

- Use only already-installed pet ids from `${CODEX_HOME:-$HOME/.codex}/pets`.
- Do not create pets, generate art, repair spritesheets, or combine pets into one spritesheet.
- If a requested pet is missing or invalid, tell the user to create or repair it with `$hatch-pet` first.

## Supported Package Versions

The validator and native overlay support both installed atlas formats:

- v1: 8 columns x 9 rows, 192x208 cells, 1536x1872 pixels.
- v2: `spriteVersionNumber: 2`, 8 columns x 11 rows, 192x208 cells, 1536x2288 pixels.

Manifests may name the image with either `spritesheetPath` or `spritesheet`, and may name the pet with either `displayName` or `name`. v2 packages without an explicit `atlas` block use the standard v2 geometry above. The overlay reads the selected pet's atlas geometry instead of assuming the v1 height.

## Setup

Run shell commands from this skill directory unless a command explicitly changes directory.

Install overlay dependencies once:

```bash
scripts/setup_overlay.sh
```

The launcher also runs setup automatically if Electron is missing.

Manual dependency install from the runtime folder:

```bash
cd app && npm install
```

Update an installed skill checkout:

```bash
git pull && scripts/setup_overlay.sh
```

## Slash Command Contract

When invoked as `/wake-pets`, treat the first argument as a command only when it is exactly `config` or `stop`. Otherwise, treat the full argument string as a pet list. Pet ids may be comma-separated, space-separated, or both.

- `/wake-pets koji, nabi` opens the overlay with `koji` and `nabi`.
- `/wake-pets jack` opens the overlay if needed, or adds `jack` to the existing overlay if it is already running.
- `/wake-pets config` opens or focuses the configuration window.
- `/wake-pets stop` closes the overlay app process.

Do not open duplicate overlay apps. Repeated pet invocations must add missing pets to the existing overlay process.

Equivalent helper commands:

```bash
scripts/run_overlay.sh koji, nabi
scripts/run_overlay.sh jack
scripts/run_overlay.sh config
scripts/run_overlay.sh stop
```

`scripts/run_overlay.sh config koji, nabi` opens config and wakes those pets.

## Validate Pets

List installed pets and validation status:

```bash
scripts/list_custom_pets.py
```

## Wake Pets

Wake one or more pets with friendly arguments:

```bash
scripts/run_overlay.sh koji, nabi
```

The lower-level equivalent is:

```bash
scripts/run_overlay.sh --pets koji jack nabi
```

The direct Electron equivalent is:

```bash
cd app && npm start -- --pets koji jack nabi
```

If the overlay is already running, run the same command with additional pet ids to add missing pets to the live overlay.

Direct Electron invocations can also add missing pets to the live overlay:

```bash
cd app && npm start -- --pets jack
```

Wake pets and open config:

```bash
scripts/run_overlay.sh --config --pets koji jack nabi
```

The direct Electron equivalent is:

```bash
cd app && npm start -- --config --pets koji jack nabi
```

## Open Config

Open or focus the configuration window:

```bash
scripts/run_overlay.sh config
```

The direct Electron equivalent is:

```bash
cd app && npm run config
```

Config can wake/despawn pets, toggle movement/collisions, show or hide names, change movement speed, change idle animation speed, and resize running pets.

## Stop Overlay

Use config `Despawn All`, despawn each pet, or stop the process:

```bash
scripts/run_overlay.sh stop
```

The direct process-stop equivalent is:

```bash
pkill -f 'wake-pets/app'
```
