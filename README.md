# Wake Pets v1 and v2

<img width="867" height="369" alt="demo" src="https://github.com/user-attachments/assets/3005b893-9134-41ba-ac3a-c2782c0d7416" />

A Codex skill with a bundled native multi-pet overlay for installed Codex pets.

Supports legacy v1 8x9 atlases and v2 8x11 atlases.

## Fork Changes

This fork is maintained from the upstream skill at [princejoogie/wake-pets](https://github.com/princejoogie/wake-pets). It remains a drop-in replacement for the original `wake-pets` skill while documenting and carrying these changes:

- Added v2 validation for `spriteVersionNumber: 2` 8x11 atlases (`1536x2288`) alongside legacy v1 8x9 atlases (`1536x1872`).
- Made runtime atlas geometry manifest-aware so v1 and v2 sheets render at the correct dimensions.
- Added support for `spritesheet`/`spritesheetPath` and `name`/`displayName` manifest aliases.
- Fixed Windows sprite loading by converting filesystem paths with `pathToFileURL`.
- Updated config previews and UI branding to `Wake Pets v1 and v2`.
- Expanded the pet size range from 25%–175% to 25%–300% of each pet's default size.

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
