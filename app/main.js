const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CELL_W = 192;
const CELL_H = 208;
const PET_WINDOW_PAD = 36;
const MIN_SCALE = 0.36;
const MAX_SCALE = 1.08;
const SCALE_STEP = 0.08;
const COLLISION_PAUSE_MIN_MS = 2600;
const COLLISION_PAUSE_MAX_MS = 4200;
const COLLISION_COOLDOWN_MS = 1800;
const DROP_IDLE_SPEED = 48;
const INTERACTION_ROWS = [0, 3, 4, 5];
const STOPPED_ROWS = [0, 3, 4, 5, 6, 8];
const STOPPED_ROW_CHANGE_MIN_MS = 1800;
const STOPPED_ROW_CHANGE_MAX_MS = 3400;
const REQUEST_FILE = path.join(os.tmpdir(), "native-multi-pet-overlay-add.json");
const pets = new Map();
const overlaySettings = {
  movementEnabled: true,
  collisionsEnabled: true,
  speedMultiplier: 1
};

let lastTick = Date.now();
let configWin;

function requestedPetIds(argv = process.argv) {
  const markerIndex = argv.indexOf("--pets");
  if (markerIndex === -1) return [];
  const values = [];
  for (const value of argv.slice(markerIndex + 1)) {
    if (value.startsWith("--")) break;
    values.push(value);
  }
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z0-9][a-z0-9_-]*$/.test(value));
}

function wantsConfig(argv = process.argv) {
  return argv.includes("--config");
}

function petPayload(id) {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const petDir = path.join(codexHome, "pets", id);
  const manifest = JSON.parse(fs.readFileSync(path.join(petDir, "pet.json"), "utf8"));
  const spritesheetPath = manifest.spritesheetPath || "spritesheet.webp";
  return {
    id,
    displayName: manifest.displayName || manifest.id || id,
    sprite: `file://${path.join(petDir, spritesheetPath)}`
  };
}

function installedPets() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const petsDir = path.join(codexHome, "pets");
  if (!fs.existsSync(petsDir)) return [];
  return fs.readdirSync(petsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return petPayload(entry.name);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setVelocityFromAngle(pet, angle, speed) {
  pet.vx = Math.cos(angle) * speed;
  pet.vy = Math.sin(angle) * speed;
}

function speedOf(pet) {
  return Math.hypot(pet.vx, pet.vy);
}

function normalizeVelocity(pet, targetSpeed, rate) {
  const speed = speedOf(pet);
  if (speed < 0.01) {
    setVelocityFromAngle(pet, Math.random() * Math.PI * 2, targetSpeed);
    return;
  }
  const nextSpeed = speed + (targetSpeed - speed) * rate;
  pet.vx = pet.vx / speed * nextSpeed;
  pet.vy = pet.vy / speed * nextSpeed;
}

function bounds() {
  return screen.getPrimaryDisplay().workArea;
}

function petHitBox(pet) {
  const spriteWidth = CELL_W * pet.scale;
  const spriteHeight = CELL_H * pet.scale;
  const insetX = (pet.width - spriteWidth) / 2 + spriteWidth * 0.12;
  const insetY = (pet.height - spriteHeight) / 2 + spriteHeight * 0.1;
  return {
    left: pet.x + insetX,
    right: pet.x + pet.width - insetX,
    top: pet.y + insetY,
    bottom: pet.y + pet.height - insetY
  };
}

function hitBoxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function centerOf(pet) {
  return {
    x: pet.x + pet.width / 2,
    y: pet.y + pet.height / 2
  };
}

function petWindowSize(scale) {
  return {
    width: Math.ceil(CELL_W * MAX_SCALE + PET_WINDOW_PAD * 2),
    height: Math.ceil(CELL_H * MAX_SCALE + PET_WINDOW_PAD * 2)
  };
}

function petForSender(sender) {
  return [...pets.values()].find((candidate) => candidate.win.webContents === sender);
}

function sendPetConfig(pet) {
  pet.win.webContents.send("pet-config", {
    id: pet.id,
    displayName: pet.displayName,
    sprite: pet.sprite,
    scale: pet.scale
  });
}

function overlayState() {
  return {
    installedPets: installedPets().map((pet) => ({ id: pet.id, displayName: pet.displayName })),
    runningPets: [...pets.keys()],
    overlaySettings
  };
}

function broadcastState() {
  if (configWin && !configWin.isDestroyed()) {
    configWin.webContents.send("overlay-state", overlayState());
  }
}

function createConfigWindow() {
  if (configWin && !configWin.isDestroyed()) {
    configWin.show();
    configWin.focus();
    broadcastState();
    return;
  }

  configWin = new BrowserWindow({
    width: 520,
    height: 620,
    minWidth: 420,
    minHeight: 420,
    title: "Pets Overlay",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  configWin.setMenuBarVisibility(false);
  configWin.once("ready-to-show", () => {
    configWin.show();
    configWin.focus();
  });
  configWin.webContents.once("did-finish-load", broadcastState);
  configWin.on("closed", () => {
    configWin = undefined;
    if (pets.size === 0) app.quit();
  });
  configWin.loadFile(path.join(__dirname, "config-window.html"));
}

function createPetWindow(id) {
  if (pets.has(id)) return;

  let payload;
  try {
    payload = petPayload(id);
  } catch (error) {
    console.error(error);
    return;
  }

  const display = bounds();
  const defaultScale = id === "palkia" ? 0.64 : 0.58;
  const { width, height } = petWindowSize(defaultScale);
  const pet = {
    ...payload,
    scale: defaultScale,
    defaultScale,
    width,
    height,
    x: Math.round(randomRange(display.x + 40, display.x + display.width - width - 40)),
    y: Math.round(randomRange(display.y + 40, display.y + display.height - height - 80)),
    vx: 0,
    vy: 0,
    defaultSpeed: randomRange(78, 92),
    frame: Math.floor(Math.random() * 8),
    dragging: false,
    pinned: false,
    interactingUntil: 0,
    collisionCooldownUntil: 0,
    interactionRow: 0,
    stoppedRow: 0,
    stoppedRowUntil: 0
  };
  setVelocityFromAngle(pet, Math.random() * Math.PI * 2, pet.defaultSpeed);

  const win = new BrowserWindow({
    x: pet.x,
    y: pet.y,
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  pet.win = win;
  pets.set(id, pet);
  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
  win.webContents.once("did-finish-load", () => {
    sendPetConfig(pet);
  });
  win.on("closed", () => {
    pets.delete(id);
    broadcastState();
    if (pets.size === 0 && app.isReady() && (!configWin || configWin.isDestroyed())) app.quit();
  });
  win.loadFile(path.join(__dirname, "pet-window.html"));
  broadcastState();
}

function addPets(ids) {
  for (const id of [...new Set(ids)]) createPetWindow(id);
  broadcastState();
}

function chooseStoppedRow(pet, now = Date.now()) {
  pet.stoppedRow = STOPPED_ROWS[Math.floor(Math.random() * STOPPED_ROWS.length)];
  pet.stoppedRowUntil = now + randomRange(STOPPED_ROW_CHANGE_MIN_MS, STOPPED_ROW_CHANGE_MAX_MS);
}

function stopPet(pet) {
  pet.dragging = false;
  pet.vx = 0;
  pet.vy = 0;
  pet.pinned = true;
  pet.interactingUntil = 0;
  chooseStoppedRow(pet);
}

function setPetScale(pet, scale) {
  const oldCenter = centerOf(pet);
  const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
  const nextSize = petWindowSize(nextScale);
  pet.scale = nextScale;
  pet.width = nextSize.width;
  pet.height = nextSize.height;
  pet.x = oldCenter.x - pet.width / 2;
  pet.y = oldCenter.y - pet.height / 2;
  bounce(pet);
  pet.win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: pet.width, height: pet.height }, false);
  sendPetConfig(pet);
}

function writeAddRequest(ids) {
  if (!ids.length) return;
  try {
    fs.writeFileSync(REQUEST_FILE, JSON.stringify({ ids, createdAt: Date.now() }));
  } catch (error) {
    console.error(error);
  }
}

function consumeAddRequest() {
  let request;
  try {
    request = JSON.parse(fs.readFileSync(REQUEST_FILE, "utf8"));
    fs.rmSync(REQUEST_FILE, { force: true });
  } catch {
    return;
  }
  if (Array.isArray(request.ids)) addPets(request.ids);
}

function bounce(pet) {
  const area = bounds();
  let hitX = 0;
  let hitY = 0;
  if (pet.x < area.x || pet.x > area.x + area.width - pet.width) {
    hitX = pet.x < area.x ? 1 : -1;
    pet.x = clamp(pet.x, area.x, area.x + area.width - pet.width);
  }
  if (pet.y < area.y || pet.y > area.y + area.height - pet.height) {
    hitY = pet.y < area.y ? 1 : -1;
    pet.y = clamp(pet.y, area.y, area.y + area.height - pet.height);
  }
  if (hitX || hitY) {
    const baseAngle = Math.atan2(hitY, hitX);
    const angle = baseAngle + randomRange(-1.1, 1.1);
    const slowed = clamp(speedOf(pet) * randomRange(0.38, 0.62), pet.defaultSpeed * 0.42, pet.defaultSpeed * 0.86);
    setVelocityFromAngle(pet, angle, slowed);
  }
}

function tick() {
  const now = Date.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  const activePets = [...pets.values()].filter((pet) => pet.win && !pet.win.isDestroyed());

  for (let i = 0; i < activePets.length; i += 1) {
    for (let j = i + 1; j < activePets.length; j += 1) {
      const a = activePets[i];
      const b = activePets[j];
      if (!overlaySettings.collisionsEnabled || a.dragging || b.dragging) continue;
      if (now < a.collisionCooldownUntil || now < b.collisionCooldownUntil) continue;
      if (!hitBoxesOverlap(petHitBox(a), petHitBox(b))) continue;

      const pauseMs = randomRange(COLLISION_PAUSE_MIN_MS, COLLISION_PAUSE_MAX_MS);
      a.interactingUntil = now + pauseMs;
      b.interactingUntil = now + pauseMs;
      a.collisionCooldownUntil = now + pauseMs + COLLISION_COOLDOWN_MS;
      b.collisionCooldownUntil = now + pauseMs + COLLISION_COOLDOWN_MS;
      a.interactionRow = INTERACTION_ROWS[Math.floor(Math.random() * INTERACTION_ROWS.length)];
      b.interactionRow = INTERACTION_ROWS[Math.floor(Math.random() * INTERACTION_ROWS.length)];
      a.vx = 0;
      a.vy = 0;
      b.vx = 0;
      b.vy = 0;

      const runner = Math.random() > 0.5 ? a : b;
      const other = runner === a ? b : a;
      const runnerCenter = centerOf(runner);
      const otherCenter = centerOf(other);
      const fleeAngle = Math.atan2(runnerCenter.y - otherCenter.y, runnerCenter.x - otherCenter.x) + randomRange(-0.45, 0.45);
      setTimeout(() => {
        if (!pets.has(runner.id) || runner.win?.isDestroyed()) return;
        runner.pinned = false;
        other.pinned = false;
        setVelocityFromAngle(runner, fleeAngle, runner.defaultSpeed * randomRange(2.0, 2.65));
        setVelocityFromAngle(other, fleeAngle + Math.PI + randomRange(-0.35, 0.35), other.defaultSpeed * randomRange(0.55, 0.85));
      }, pauseMs);
    }
  }

  for (const pet of activePets) {
    if (!pet.win || pet.win.isDestroyed()) continue;
    if (pet.pinned && now >= pet.stoppedRowUntil) chooseStoppedRow(pet, now);
    if (!pet.dragging && !pet.pinned && now >= pet.interactingUntil && overlaySettings.movementEnabled) {
      const movementDt = dt * overlaySettings.speedMultiplier;
      pet.x += pet.vx * movementDt;
      pet.y += pet.vy * movementDt;
      pet.vx += Math.sin(now / 700 + pet.frame) * 5 * movementDt;
      pet.vy += Math.cos(now / 900 + pet.frame) * 4 * movementDt;
      bounce(pet);
      normalizeVelocity(pet, pet.defaultSpeed, Math.min(1, dt * 0.55));
      pet.win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: pet.width, height: pet.height }, false);
    }
    pet.win.webContents.send("pet-motion", {
      vx: pet.vx,
      vy: pet.vy,
      row: now < pet.interactingUntil ? pet.interactionRow : (pet.pinned ? pet.stoppedRow : undefined),
      state: now < pet.interactingUntil ? "interact" : (pet.pinned ? "stopped" : "move")
    });
  }
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  writeAddRequest(requestedPetIds());
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => addPets(requestedPetIds(argv)));
}

app.whenReady().then(() => {
  app.dock?.hide();
  addPets(requestedPetIds());
  if (wantsConfig() || requestedPetIds().length === 0) createConfigWindow();
  consumeAddRequest();
  setInterval(consumeAddRequest, 500);
  setInterval(tick, 1000 / 60);
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.on("pet-drag-start", (event, point) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  pet.dragging = true;
  pet.pinned = false;
  pet.dragOffsetX = point.x - pet.x;
  pet.dragOffsetY = point.y - pet.y;
  pet.lastDragX = point.x;
  pet.lastDragY = point.y;
  pet.lastDragT = Date.now();
});

ipcMain.on("pet-drag-move", (event, point) => {
  const pet = petForSender(event.sender);
  if (!pet || !pet.dragging) return;
  const now = Date.now();
  const dt = Math.max(16, now - pet.lastDragT);
  pet.vx = (point.x - pet.lastDragX) / dt * 1000;
  pet.vy = (point.y - pet.lastDragY) / dt * 1000;
  pet.x = point.x - pet.dragOffsetX;
  pet.y = point.y - pet.dragOffsetY;
  bounce(pet);
  pet.win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: pet.width, height: pet.height }, false);
  pet.lastDragX = point.x;
  pet.lastDragY = point.y;
  pet.lastDragT = now;
});

ipcMain.on("pet-drag-end", (event) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  pet.dragging = false;
  if (speedOf(pet) < DROP_IDLE_SPEED) {
    pet.vx = 0;
    pet.vy = 0;
    pet.pinned = true;
    chooseStoppedRow(pet);
    return;
  }
  pet.pinned = false;
  normalizeVelocity(pet, clamp(speedOf(pet), DROP_IDLE_SPEED, 360), 1);
});

ipcMain.on("pet-despawn", (event) => {
  const pet = petForSender(event.sender);
  if (pet?.win && !pet.win.isDestroyed()) pet.win.close();
});

ipcMain.on("overlay-open-config", () => {
  createConfigWindow();
});

ipcMain.on("overlay-state-request", (event) => {
  event.sender.send("overlay-state", overlayState());
});

ipcMain.on("overlay-spawn-pets", (_event, ids) => {
  if (Array.isArray(ids)) addPets(ids);
});

ipcMain.on("overlay-despawn-pet", (_event, id) => {
  const pet = pets.get(id);
  if (pet?.win && !pet.win.isDestroyed()) pet.win.close();
});

ipcMain.on("overlay-despawn-all", () => {
  for (const pet of pets.values()) {
    if (pet.win && !pet.win.isDestroyed()) pet.win.close();
  }
});

ipcMain.on("overlay-update-settings", (_event, settings) => {
  if (!settings || typeof settings !== "object") return;
  if (typeof settings.movementEnabled === "boolean") overlaySettings.movementEnabled = settings.movementEnabled;
  if (typeof settings.collisionsEnabled === "boolean") overlaySettings.collisionsEnabled = settings.collisionsEnabled;
  if (typeof settings.speedMultiplier === "number") overlaySettings.speedMultiplier = clamp(settings.speedMultiplier, 0.25, 2.5);
  broadcastState();
});

ipcMain.on("pet-stop", (event) => {
  const pet = petForSender(event.sender);
  if (pet) stopPet(pet);
});

ipcMain.on("pet-resize", (event, direction) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  stopPet(pet);
  setPetScale(pet, pet.scale + (direction === "smaller" ? -SCALE_STEP : SCALE_STEP));
});

ipcMain.on("pet-reset-size", (event) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  stopPet(pet);
  setPetScale(pet, pet.defaultScale);
});

ipcMain.on("pet-close-overlay", () => {
  app.quit();
});
