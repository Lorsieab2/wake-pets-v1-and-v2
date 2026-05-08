# Wake Pets

Codex skill with a bundled native multi-pet overlay for installed Codex pets. It wakes multiple existing pet packages at once and shows each pet as its own draggable always-on-top desktop overlay.

This app does not create new pet art. Pets must already exist under:

```text
~/.codex/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

## Project Layout

- `SKILL.md` - Codex skill instructions.
- `app/` - Electron app that runs the pet overlays and configuration window.
- `scripts/` - validation, setup, and launcher helpers used by the skill.
- `references/` - implementation notes for maintainers.

The Codex skill name is `wake-pets`.

## Install For Codex

One-line install from GitHub:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills" && git clone https://github.com/princejoogie/pets-overlay.git "${CODEX_HOME:-$HOME/.codex}/skills/wake-pets" && cd "${CODEX_HOME:-$HOME/.codex}/skills/wake-pets" && scripts/setup_overlay.sh
```

The explicit clone destination is what makes the installed Codex skill directory `wake-pets`. If the GitHub repository is renamed to `wake-pets`, replace the clone URL with `https://github.com/princejoogie/wake-pets.git`.

After installing, restart Codex if it does not immediately discover new skills.

## Updating The Codex Skill

If installed with the one-line GitHub command, update from the cloned `wake-pets` directory:

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/wake-pets" && git pull && scripts/setup_overlay.sh
```

## Install

Install Electron dependencies from the skill runtime folder:

```bash
cd app
npm install
```

Or run the setup helper from the project root:

```bash
./scripts/setup_overlay.sh
```

## Wake Pets

Start the overlay with one or more existing pet ids:

```bash
cd app
npm start -- --pets koji jack nabi
```

The skill helper does setup automatically when dependencies are missing:

```bash
./scripts/run_overlay.sh --pets koji jack nabi
```

If the overlay is already running, running the same command with more pet ids adds any missing pets to the live overlay instead of opening a duplicate overlay app:

```bash
npm start -- --pets jack
```

## Open The Configuration Window

Open only the configuration window:

```bash
cd app
npm run config
```

Open the configuration window while also waking pets:

```bash
cd app
npm start -- --config --pets koji jack nabi
```

The configuration window lets you:

- See installed pets and which ones are running.
- Wake all pets or wake/despawn individual pets.
- Despawn a single pet.
- Despawn all pets.
- Toggle movement.
- Toggle pet collisions.
- Show or hide pet names.
- Adjust movement speed.
- Adjust idle animation speed.
- Adjust each running pet's size.

## Pet Controls

Each pet is its own small transparent native window.

- Drag a pet to move it.
- Drop a pet gently to keep it stopped in that spot.
- Throw a pet with a faster drag release to make it keep moving.
- Right-click a pet to stop it and open its menu.

The right-click menu includes:

- `Smaller`
- `Larger`
- `Reset size`
- `Open Config`
- `Despawn pet`

If all pets are despawned and the configuration window is closed, the overlay process exits automatically.

## Behavior Notes

- Moving pets use the atlas running-right and running-left rows.
- Newly woken pets start stopped instead of wandering automatically.
- Newly woken pets use a smaller default scale, and thrown pets settle into a slower default movement speed.
- Dragged pets show running left/right frames while being moved.
- Only a fast thrown release makes a pet continue moving after drag.
- Stopped pets use non-running animation rows.
- Pet collision can pause both pets for a short interaction; only pets that were already moving from a throw continue afterward.
- Each native pet window is sized to the pet's current sprite scale so its click bounds stay tight.

## Stop The Overlay

Use the configuration window's `Despawn All` button, despawn each pet from its right-click menu, or stop the Electron process:

```bash
pkill -f 'wake-pets/app|pets-overlay/app'
```
