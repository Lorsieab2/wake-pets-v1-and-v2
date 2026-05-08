# Pets Overlay

Native multi-pet overlay for installed Codex pets.

## Layout

- `app/` - Electron overlay app.
- `skills/wake-multiple-pets/` - project copy of the Codex skill.

## Run

```bash
cd app
npm start -- --pets koji nabi palkia
```

Open the configuration window:

```bash
cd app
npm run config
```

If the overlay is already running, launching again with `--pets <ids>` adds missing pets to the existing process.
