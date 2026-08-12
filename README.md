# Wake Pets v1 and v2

<img width="867" height="369" alt="demo" src="https://github.com/user-attachments/assets/3005b893-9134-41ba-ac3a-c2782c0d7416" />

A Codex skill with a bundled native multi-pet overlay for installed Codex pets.

Supports legacy v1 8x9 atlases and v2 8x11 atlases.

## Standalone Windows App

The repository also ships a separate portable Electron app. It runs independently of Codex and the installed skill. At startup it reads `$CODEX_HOME/pets` or `%USERPROFILE%\.codex\pets` directly, even when Codex is closed, then falls back to a `pets` folder beside the executable.

Build it from PowerShell after installing the app dependencies:

```powershell
cd app
npm install
cd ..
scripts\build_standalone.ps1 -PetId my-pet,another-pet
```

The generated `release\Wake-Pets-v1-and-v2-1.1.0.zip` contains `Wake Codex Pets without Codex.exe` and an adjacent `pets` folder. The bundled folder is a fallback; users can add additional valid pet packages there, while the app continues to pick up packages from the Codex pets folder automatically.

## Fork Changes

This fork is maintained from the upstream skill at [princejoogie/wake-pets](https://github.com/princejoogie/wake-pets). It remains a drop-in replacement for the original `wake-pets` skill while documenting and carrying these changes:

- Added v2 validation for `spriteVersionNumber: 2` 8x11 atlases (`1536x2288`) alongside legacy v1 8x9 atlases (`1536x1872`).
- Made runtime atlas geometry manifest-aware so v1 and v2 sheets render at the correct dimensions.
- Added support for `spritesheet`/`spritesheetPath` and `name`/`displayName` manifest aliases.
- Fixed Windows sprite loading by converting filesystem paths with `pathToFileURL`.
- Updated config previews and UI branding to `Wake Pets v1 and v2`.
- Expanded the pet size range from 25%–175% to 25%–300% of each pet's base scale, with pets spawning at 100% by default.
- Added quick size toggles for `100%` and `175%` in the configuration window.
- Moved pet name labels below the sprite artwork and kept collision hitboxes limited to the artwork area.
- Updated Electron from `41.5.0` to `41.10.3`, resolving the two Dependabot security advisories reported for the overlay runtime.
- Uses rows `0` and `3`–`8` as stopped, stationary mouse-rollover, and collision animations, while reserving rows `1`–`2` for running directions and rows `9`–`10` for perspective views.

The original repository is retained as the `upstream` Git remote for future comparison and updates.

## Video Demo

https://github.com/user-attachments/assets/84e5b78d-9920-4ba1-82e4-99d49723bf89

## Install For Codex

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills" && git clone https://github.com/Lorsieab2/wake-pets-v1-and-v2.git "${CODEX_HOME:-$HOME/.codex}/skills/wake-pets" && cd "${CODEX_HOME:-$HOME/.codex}/skills/wake-pets" && scripts/setup_overlay.sh
```

After installing, restart Codex if it does not immediately discover new skills.

## Slash Commands

```text
/wake-pets <pet-name>, nabi
/wake-pets <pet-name>
/wake-pets config
/wake-pets stop
```

- `/wake-pets koji, nabi` opens the overlay with `koji` and `nabi`.
- `/wake-pets jack` opens the overlay if needed, or adds `jack` to the existing overlay if it is already open.
- `/wake-pets config` opens or focuses the configuration window.
- `/wake-pets stop` closes the overlay app process.

Pet ids may be comma-separated, space-separated, or both. `config` and `stop` are reserved commands only when they are the first argument.

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
