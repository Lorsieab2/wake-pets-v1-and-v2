const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const LEGACY_ATLAS = Object.freeze({
  version: 1,
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872
});
const V2_ATLAS = Object.freeze({
  version: 2,
  columns: 8,
  rows: 11,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 2288
});
const PET_WINDOW_PAD = 0;
const PET_LABEL_GAP = 4;
const PET_LABEL_HEIGHT = 23;
const MIN_SCALE_MULTIPLIER = 0.25;
const MAX_SCALE_MULTIPLIER = 3;
const SCALE_STEP = 0.08;
const DEFAULT_SCALE = 0.46;
const LARGE_PET_DEFAULT_SCALE = 0.52;
const DEFAULT_SIZE_MULTIPLIER = 1;
const DEFAULT_SPEED_MIN = 52;
const DEFAULT_SPEED_MAX = 64;
const COLLISION_PAUSE_MIN_MS = 2600;
const COLLISION_PAUSE_MAX_MS = 4200;
const COLLISION_COOLDOWN_MS = 1800;
const DROP_IDLE_SPEED = 48;
const IDLE_ROWS = [0, 3, 4, 5, 6, 7, 8];
const INTERACTION_ROWS = IDLE_ROWS;
const STOPPED_ROWS = IDLE_ROWS;
const STOPPED_ROW_CHANGE_MIN_MS = 14000;
const STOPPED_ROW_CHANGE_MAX_MS = 30000;
const REQUEST_FILE = path.join(os.tmpdir(), "native-multi-pet-overlay-add.json");
const pets = new Map();
const overlaySettings = {
  movementEnabled: false,
  collisionsEnabled: true,
  showNames: true,
  speedMultiplier: 1,
  idleAnimationSpeed: 1
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

function manifestVersion(manifest) {
  const value = manifest.spriteVersionNumber ?? manifest.sprite_version_number ?? 1;
  const version = Number(value);
  return Number.isInteger(version) ? version : 0;
}

function atlasForManifest(manifest) {
  const defaults = manifestVersion(manifest) === 2 ? V2_ATLAS : LEGACY_ATLAS;
  const source = manifest.atlas && typeof manifest.atlas === "object" ? manifest.atlas : {};
  const numberOrDefault = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    version: manifestVersion(manifest) || defaults.version,
    columns: numberOrDefault(source.columns, defaults.columns),
    rows: numberOrDefault(source.rows, defaults.rows),
    cellWidth: numberOrDefault(source.cellWidth ?? source.cell_width, defaults.cellWidth),
    cellHeight: numberOrDefault(source.cellHeight ?? source.cell_height, defaults.cellHeight),
    width: numberOrDefault(source.width, defaults.width),
    height: numberOrDefault(source.height, defaults.height)
  };
}

function petPayload(id) {
  const petDir = petDirectoryFor(id);
  const manifest = JSON.parse(fs.readFileSync(path.join(petDir, "pet.json"), "utf8"));
  const spritesheetPath = manifest.spritesheetPath || manifest.spritesheet || "spritesheet.webp";
  return {
    id,
    displayName: manifest.displayName || manifest.name || manifest.id || id,
    sprite: pathToFileURL(path.join(petDir, spritesheetPath)).toString(),
    atlas: atlasForManifest(manifest)
  };
}

function petRoots() {
  const roots = [];
  const addRoot = (value) => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!roots.includes(resolved)) roots.push(resolved);
  };

  addRoot(process.env.WAKE_PETS_DIR);
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  addRoot(path.join(codexHome, "pets"));
  if (app.isPackaged) {
    addRoot(path.join(path.dirname(process.execPath), "pets"));
    addRoot(path.join(process.resourcesPath, "pets"));
  } else {
    addRoot(path.join(__dirname, "pets"));
  }

  return roots;
}

function petDirectoryFor(id) {
  for (const root of petRoots()) {
    const petDir = path.join(root, id);
    if (fs.existsSync(path.join(petDir, "pet.json"))) return petDir;
  }
  throw new Error(`Pet package not found: ${id}`);
}

function defaultScaleForPet(id) {
  return id === "palkia" ? LARGE_PET_DEFAULT_SCALE : DEFAULT_SCALE;
}

function installedPets() {
  const ids = new Set();
  for (const root of petRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids]
    .map((id) => {
      try {
        return petPayload(id);
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
  const spriteWidth = pet.atlas.cellWidth * pet.scale;
  const spriteHeight = pet.atlas.cellHeight * pet.scale;
  return {
    left: pet.x + spriteWidth * 0.12,
    right: pet.x + spriteWidth * 0.88,
    top: pet.y + spriteHeight * 0.1,
    bottom: pet.y + spriteHeight * 0.9
  };
}

function hitBoxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function centerOf(pet) {
  const spriteHeight = pet.atlas.cellHeight * pet.scale;
  return {
    x: pet.x + pet.width / 2,
    y: pet.y + spriteHeight / 2
  };
}

function petWindowSize(scale, atlas = LEGACY_ATLAS) {
  return {
    width: Math.ceil(atlas.cellWidth * scale + PET_WINDOW_PAD * 2),
    height: Math.ceil(atlas.cellHeight * scale + PET_LABEL_GAP + PET_LABEL_HEIGHT + PET_WINDOW_PAD * 2)
  };
}

function petStillOpen(pet) {
  return pets.has(pet.id) && pet.win && !pet.win.isDestroyed();
}

function showPetMenu(pet) {
  if (!petStillOpen(pet)) return;
  stopPet(pet);
  Menu.buildFromTemplate([
    {
      label: "Smaller",
      click: () => {
        if (petStillOpen(pet)) setPetScale(pet, pet.scale - SCALE_STEP, true);
      }
    },
    {
      label: "Larger",
      click: () => {
        if (petStillOpen(pet)) setPetScale(pet, pet.scale + SCALE_STEP, true);
      }
    },
    {
      label: "Reset size",
      click: () => {
        if (petStillOpen(pet)) setPetScale(pet, pet.spawnScale, true);
      }
    },
    {
      label: "Open Config",
      click: () => createConfigWindow()
    },
    { type: "separator" },
    {
      label: "Despawn pet",
      click: () => {
        if (petStillOpen(pet)) pet.win.close();
      }
    }
  ]).popup({ window: pet.win });
}

function petForSender(sender) {
  return [...pets.values()].find((candidate) => candidate.win.webContents === sender);
}

function sendPetConfig(pet) {
  pet.win.webContents.send("pet-config", {
    id: pet.id,
    displayName: pet.displayName,
    sprite: pet.sprite,
    scale: pet.scale,
    flipX: pet.flipX,
    flipY: pet.flipY,
    atlas: pet.atlas
  });
}

function overlayState() {
  return {
    installedPets: installedPets().map((pet) => ({
      id: pet.id,
      displayName: pet.displayName,
      sprite: pet.sprite,
      atlas: pet.atlas,
      defaultScale: defaultScaleForPet(pet.id)
    })),
    runningPets: [...pets.keys()],
    runningPetDetails: [...pets.values()].map((pet) => ({ id: pet.id, scale: pet.scale, defaultScale: pet.defaultScale, flipX: pet.flipX, flipY: pet.flipY })),
    petScaleLimits: { min: MIN_SCALE_MULTIPLIER, max: MAX_SCALE_MULTIPLIER, step: 0.01 },
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
    configWin.moveTop();
    configWin.focus();
    broadcastState();
    return;
  }

  configWin = new BrowserWindow({
    width: 560,
    height: 680,
    minWidth: 460,
    minHeight: 480,
    title: "Wake Pets v1 and v2",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    backgroundColor: "#f2f2f7",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  configWin.setMenuBarVisibility(false);
  configWin.setAlwaysOnTop(true, "modal-panel");
  configWin.once("ready-to-show", () => {
    configWin.show();
    configWin.moveTop();
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
  const baseScale = defaultScaleForPet(id);
  const spawnScale = baseScale * DEFAULT_SIZE_MULTIPLIER;
  const { width, height } = petWindowSize(spawnScale, payload.atlas);
  const pet = {
    ...payload,
    scale: spawnScale,
    defaultScale: baseScale,
    spawnScale,
    width,
    height,
    x: Math.round(randomRange(display.x + 40, display.x + display.width - width - 40)),
    y: Math.round(randomRange(display.y + 40, display.y + display.height - height - 80)),
    vx: 0,
    vy: 0,
    defaultSpeed: randomRange(DEFAULT_SPEED_MIN, DEFAULT_SPEED_MAX),
    frame: Math.floor(Math.random() * 8),
    dragging: false,
    pinned: true,
    movementSource: undefined,
    interactingUntil: 0,
    collisionCooldownUntil: 0,
    interactionRow: 0,
    stoppedRow: 0,
    stoppedRowUntil: 0,
    flipX: false,
    flipY: false
  };
  chooseStoppedRow(pet);
  if (overlaySettings.movementEnabled) startPetMovement(pet);

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
  pet.movementSource = undefined;
  pet.interactingUntil = 0;
  chooseStoppedRow(pet);
}

function startPetMovement(pet) {
  if (pet.dragging) return;
  pet.pinned = false;
  pet.movementSource = "auto";
  pet.interactingUntil = 0;
  setVelocityFromAngle(pet, Math.random() * Math.PI * 2, pet.defaultSpeed * randomRange(0.9, 1.15));
}

function setPetScale(pet, scale, shouldBroadcast = false) {
  const oldCenter = centerOf(pet);
  const nextScale = clamp(scale, pet.defaultScale * MIN_SCALE_MULTIPLIER, pet.defaultScale * MAX_SCALE_MULTIPLIER);
  const nextSize = petWindowSize(nextScale, pet.atlas);
  pet.scale = nextScale;
  pet.width = nextSize.width;
  pet.height = nextSize.height;
  pet.x = oldCenter.x - pet.width / 2;
  pet.y = oldCenter.y - pet.height / 2;
  bounce(pet);
  pet.win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: pet.width, height: pet.height }, false);
  sendPetConfig(pet);
  if (shouldBroadcast) broadcastState();
}

function setPetFlip(pet, axis, value) {
  if (axis !== "x" && axis !== "y") return;
  pet[axis === "x" ? "flipX" : "flipY"] = Boolean(value);
  sendPetConfig(pet);
  broadcastState();
}

function writeOverlayRequest(argv = process.argv) {
  const ids = requestedPetIds(argv);
  const openConfig = wantsConfig(argv);
  if (!ids.length && !openConfig) return;
  try {
    fs.writeFileSync(REQUEST_FILE, JSON.stringify({ ids, openConfig, createdAt: Date.now() }));
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
  if (request.openConfig) createConfigWindow();
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
      const aWasMoving = !a.pinned && speedOf(a) >= DROP_IDLE_SPEED;
      const bWasMoving = !b.pinned && speedOf(b) >= DROP_IDLE_SPEED;
      const aMovementSource = a.movementSource;
      const bMovementSource = b.movementSource;
      if (!aWasMoving && !bWasMoving) continue;
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

      const aCenter = centerOf(a);
      const bCenter = centerOf(b);
      const aFleeAngle = Math.atan2(aCenter.y - bCenter.y, aCenter.x - bCenter.x) + randomRange(-0.45, 0.45);
      const bFleeAngle = aFleeAngle + Math.PI + randomRange(-0.35, 0.35);
      setTimeout(() => {
        if (!pets.has(a.id) || a.win?.isDestroyed() || !pets.has(b.id) || b.win?.isDestroyed()) return;
        if (aWasMoving && (overlaySettings.movementEnabled || aMovementSource === "throw")) {
          a.pinned = false;
          a.movementSource = aMovementSource === "throw" ? "throw" : "auto";
          setVelocityFromAngle(a, aFleeAngle, a.defaultSpeed * randomRange(1.35, 1.9));
        } else {
          stopPet(a);
        }
        if (bWasMoving && (overlaySettings.movementEnabled || bMovementSource === "throw")) {
          b.pinned = false;
          b.movementSource = bMovementSource === "throw" ? "throw" : "auto";
          setVelocityFromAngle(b, bFleeAngle, b.defaultSpeed * randomRange(1.35, 1.9));
        } else {
          stopPet(b);
        }
      }, pauseMs);
    }
  }

  for (const pet of activePets) {
    if (!pet.win || pet.win.isDestroyed()) continue;
    if (!overlaySettings.movementEnabled && !pet.dragging && pet.movementSource === "auto") stopPet(pet);
    if (pet.pinned && now >= pet.stoppedRowUntil) chooseStoppedRow(pet, now);
    if (!pet.dragging && !pet.pinned && now >= pet.interactingUntil && (overlaySettings.movementEnabled || pet.movementSource === "throw")) {
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
      showNames: overlaySettings.showNames,
      idleAnimationSpeed: overlaySettings.idleAnimationSpeed,
      row: now < pet.interactingUntil ? pet.interactionRow : (pet.pinned ? pet.stoppedRow : undefined),
      state: pet.dragging ? "drag" : (now < pet.interactingUntil ? "interact" : (pet.pinned ? "stopped" : "move"))
    });
  }
}

if (app.isPackaged) {
  app.setName("Wake Pets v1 and v2");
  app.setAppUserModelId("com.lorsieab2.wakepets");
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  writeOverlayRequest();
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    addPets(requestedPetIds(argv));
    if (wantsConfig(argv)) createConfigWindow();
  });
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
  pet.movementSource = undefined;
  pet.interactingUntil = 0;
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
    pet.movementSource = undefined;
    chooseStoppedRow(pet);
    return;
  }
  pet.pinned = false;
  pet.movementSource = "throw";
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

ipcMain.on("overlay-set-pet-scale", (_event, id, scale) => {
  const pet = pets.get(id);
  if (!pet || pet.win?.isDestroyed() || !Number.isFinite(scale)) return;
  setPetScale(pet, scale);
});

ipcMain.on("overlay-set-pet-flip", (_event, id, axis, value) => {
  const pet = pets.get(id);
  if (!pet || pet.win?.isDestroyed()) return;
  setPetFlip(pet, axis, value);
});

ipcMain.on("overlay-despawn-all", () => {
  for (const pet of pets.values()) {
    if (pet.win && !pet.win.isDestroyed()) pet.win.close();
  }
});

ipcMain.on("overlay-update-settings", (_event, settings) => {
  if (!settings || typeof settings !== "object") return;
  if (typeof settings.movementEnabled === "boolean" && overlaySettings.movementEnabled !== settings.movementEnabled) {
    overlaySettings.movementEnabled = settings.movementEnabled;
    for (const pet of pets.values()) {
      if (pet.win?.isDestroyed()) continue;
      if (overlaySettings.movementEnabled && pet.pinned) startPetMovement(pet);
      else if (!overlaySettings.movementEnabled && pet.movementSource === "auto") stopPet(pet);
    }
  }
  if (typeof settings.collisionsEnabled === "boolean") overlaySettings.collisionsEnabled = settings.collisionsEnabled;
  if (typeof settings.showNames === "boolean") overlaySettings.showNames = settings.showNames;
  if (typeof settings.speedMultiplier === "number") overlaySettings.speedMultiplier = clamp(settings.speedMultiplier, 0.25, 2.5);
  if (typeof settings.idleAnimationSpeed === "number") overlaySettings.idleAnimationSpeed = clamp(settings.idleAnimationSpeed, 0.25, 2.5);
  broadcastState();
});

ipcMain.on("pet-stop", (event) => {
  const pet = petForSender(event.sender);
  if (pet) stopPet(pet);
});

ipcMain.on("pet-open-menu", (event) => {
  const pet = petForSender(event.sender);
  if (pet) showPetMenu(pet);
});

ipcMain.on("pet-resize", (event, direction) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  stopPet(pet);
  setPetScale(pet, pet.scale + (direction === "smaller" ? -SCALE_STEP : SCALE_STEP), true);
});

ipcMain.on("pet-reset-size", (event) => {
  const pet = petForSender(event.sender);
  if (!pet) return;
  stopPet(pet);
  setPetScale(pet, pet.spawnScale, true);
});

ipcMain.on("pet-close-overlay", () => {
  app.quit();
});
