const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petOverlay", {
  onConfig(callback) {
    ipcRenderer.on("pet-config", (_event, pet) => callback(pet));
  },
  onMotion(callback) {
    ipcRenderer.on("pet-motion", (_event, motion) => callback(motion));
  },
  onState(callback) {
    ipcRenderer.on("overlay-state", (_event, state) => callback(state));
  },
  requestState() {
    ipcRenderer.send("overlay-state-request");
  },
  spawnPets(ids) {
    ipcRenderer.send("overlay-spawn-pets", ids);
  },
  despawnPet(id) {
    ipcRenderer.send("overlay-despawn-pet", id);
  },
  despawnAll() {
    ipcRenderer.send("overlay-despawn-all");
  },
  updateOverlaySettings(settings) {
    ipcRenderer.send("overlay-update-settings", settings);
  },
  openConfig() {
    ipcRenderer.send("overlay-open-config");
  },
  onAddPets(callback) {
    ipcRenderer.on("pet-add", (_event, pets) => callback(pets));
  },
  dragStart(point) {
    ipcRenderer.send("pet-drag-start", point);
  },
  dragMove(point) {
    ipcRenderer.send("pet-drag-move", point);
  },
  dragEnd() {
    ipcRenderer.send("pet-drag-end");
  },
  despawn() {
    ipcRenderer.send("pet-despawn");
  },
  stop() {
    ipcRenderer.send("pet-stop");
  },
  openMenu(point) {
    ipcRenderer.send("pet-open-menu", point);
  },
  resize(direction) {
    ipcRenderer.send("pet-resize", direction);
  },
  resetSize() {
    ipcRenderer.send("pet-reset-size");
  },
  setPointerInteractive(value) {
    ipcRenderer.send("pet-pointer-interaction", Boolean(value));
  },
  close() {
    ipcRenderer.send("pet-close-overlay");
  }
});
