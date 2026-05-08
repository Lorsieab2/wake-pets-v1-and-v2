# Pets Overlay

Native multi-pet overlay for installed Codex pets. It wakes multiple existing pet packages at once and shows each pet as its own draggable always-on-top desktop overlay.

This app does not create new pet art. Pets must already exist under:

```text
~/.codex/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

## Project Layout

- `app/` - Electron app that runs the pet overlays and configuration window.
- `skills/wake-multiple-pets/` - project copy of the Codex skill instructions.

The installed Codex skill at `~/.codex/skills/wake-multiple-pets` is configured to prefer this project launcher.

## Install

From the app folder:

```bash
cd ~/Documents/Codex/personal/pets-overlay/app
npm install
```

## Wake Pets

Start the overlay with one or more existing pet ids:

```bash
cd ~/Documents/Codex/personal/pets-overlay/app
npm start -- --pets koji nabi palkia
```

If the overlay is already running, running the same command with more pet ids adds any missing pets to the live overlay instead of opening a duplicate overlay app:

```bash
npm start -- --pets palkia
```

## Open The Configuration Window

Open only the configuration window:

```bash
cd ~/Documents/Codex/personal/pets-overlay/app
npm run config
```

Open the configuration window while also waking pets:

```bash
cd ~/Documents/Codex/personal/pets-overlay/app
npm start -- --config --pets koji nabi
```

The configuration window lets you:

- See installed pets and which ones are running.
- Wake selected pets.
- Despawn a single pet.
- Despawn all pets.
- Toggle movement.
- Toggle pet collisions.
- Adjust movement speed.

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
- `Despawn pet`

If all pets are despawned and the configuration window is closed, the overlay process exits automatically.

## Behavior Notes

- Moving pets use the atlas running-right and running-left rows.
- Stopped pets use non-running animation rows.
- Pet collision can pause both pets for a short interaction, then one randomly runs away faster.
- The app keeps pet windows large enough for the maximum supported sprite size to avoid clipping during animation or resizing.

## Stop The Overlay

Use the configuration window's `Despawn All` button, despawn each pet from its right-click menu, or stop the Electron process:

```bash
pkill -f pets-overlay/app
```
