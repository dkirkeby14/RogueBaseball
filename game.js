"use strict";

/* ================================
   GLOBAL CONSTANTS & HELPERS
================================= */

const GAME_WIDTH  = 1024;
const GAME_HEIGHT = 640;

const RARITIES = ["common", "bronze", "silver", "gold", "diamond", "blackDiamond"];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampAttr(value) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function rarityIndex(name) {
  const idx = RARITIES.indexOf(name);
  return idx === -1 ? 0 : idx;
}

// NEW: Overall rating helper (used everywhere for OVR)
function calculateOVR(player) {
  let attrs;

  if (player.position === "P") {
    // Pitcher: use pitching attributes for overall
    attrs = ["velocity", "movement", "control", "stamina"];
  } else {
    // Hitter / fielder: use hitting + fielding attributes
    attrs = ["contact", "power", "eye", "speed", "fielding"];
  }

  const sum = attrs.reduce((total, key) => total + (player[key] || 0), 0);
  return Math.floor(sum / attrs.length);
}

/* ================================
   PLAYER CREATION & ATTRIBUTES
   (random helper, still used for NPC style if needed)
================================= */

function makeNewPlayer(name, position, handedness, hair, skin, facial, teamColor) {
  function base(min, max) {
    return clampAttr(randInt(min, max));
  }

  const p = {
    id: "pl_" + Date.now() + "_" + randInt(1000, 9999),
    name: name || "Player",
    position: position || "P",
    handedness: handedness || "R",
    hair: hair || "short",
    skin: skin || "#f1c27d",
    facial: facial || "none",
    teamColor: teamColor || "#2a6dd6",
    rarity: "common",
    level: 1,
    xp: 0,
    xpToNextLevel: 10,
    currency: 50,
    unlockedMaxRarity: "common",
    bossCount: 0,
    // Pitcher attributes
    velocity: base(60, 80),
    movement: base(55, 80),
    control: base(55, 80),
    stamina: base(70, 95),
    // Hitter attributes
    contact: base(50, 80),
    power: base(50, 80),
    eye: base(50, 80),
    speed: base(50, 80),
    fielding: base(50, 80),
    // Pitch ratings
    pitches: {
      fastball: base(65, 85),
      slider: base(60, 80),
      curveball: base(55, 78),
      changeup: base(55, 78)
    },
    perksApplied: {},
    perksOwned: []
  };

  ["velocity", "movement", "control", "stamina",
   "contact", "power", "eye", "speed", "fielding"].forEach(attr => {
    p.perksApplied[attr] = 0;
  });

  return p;
}

function getEffectiveAttribute(player, attr) {
  const base = player[attr] || 0;
  const bonus = (player.perksApplied && player.perksApplied[attr]) || 0;
  return clampAttr(base + bonus);
}

function applyPerkToTeam(teamPlayers, stat, amount) {
  if (!teamPlayers) return;
  teamPlayers.forEach(p => {
    p.perksApplied = p.perksApplied || {};
    const current = p.perksApplied[stat] || 0;
    const base = p[stat] || 0;
    const maxExtra = 99 - base;
    const allowed = Math.max(0, Math.min(amount, maxExtra - current));
    p.perksApplied[stat] = current + allowed;
  });
}

function applyUpgradeToCustom(player, stat, amount) {
  const base = player[stat] || 0;
  const bonus = (player.perksApplied && player.perksApplied[stat]) || 0;
  const total = base + bonus;
  const room = 99 - total;
  const inc = Math.max(0, Math.min(amount, room));
  player[stat] = clampAttr(base + inc);
}

/* ================================
   PIXEL PLAYER GENERATOR
================================= */

class PixelPlayerGenerator {
  constructor(scene) {
    this.scene = scene;
    this.baseW = 16;
    this.baseH = 24;
    this.scale = 3;
    this.animFrames = {
      idle: 2,
      walk: 4,
      run: 4,
      pitch: 3,
      swing: 3,
      catch: 3
    };
    this.registered = new Set();
  }

  keyFor(cfg) {
    return [
      "char",
      cfg.id || cfg.name || "anon",
      cfg.position || "X",
      cfg.handedness || "R",
      cfg.skin || "skin",
      cfg.hair || "hair",
      cfg.facial || "face",
      cfg.teamColor || "team"
    ].join("_");
  }

  makeAnimationKeysFor(key) {
    return {
      idle: key + "_idle",
      walk: key + "_walk",
      run: key + "_run",
      pitch: key + "_pitch",
      swing: key + "_swing",
      catch: key + "_catch"
    };
  }

  generateCharacterTexture(cfg) {
    const key = this.keyFor(cfg);
    if (this.registered.has(key)) return key;

    const actions = ["idle", "walk", "run", "pitch", "swing", "catch"];
    const cols = Math.max.apply(null, actions.map(a => this.animFrames[a]));
    const rows = actions.length;

    const canvas = document.createElement("canvas");
    canvas.width = this.baseW * cols;
    canvas.height = this.baseH * rows;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    for (let r = 0; r < rows; r++) {
      const action = actions[r];
      const frames = this.animFrames[action];
      for (let f = 0; f < frames; f++) {
        const px = f * this.baseW;
        const py = r * this.baseH;
        drawPlayerFrame(ctx, px, py, this.baseW, this.baseH, f, action, cfg);
      }
      for (let f = frames; f < cols; f++) {
        const sx = (frames - 1) * this.baseW;
        const sy = r * this.baseH;
        ctx.drawImage(canvas, sx, sy, this.baseW, this.baseH, f * this.baseW, sy, this.baseW, this.baseH);
      }
    }

    let index = 0;
    const framesMap = {};
    for (let r = 0; r < rows; r++) {
      const action = actions[r];
      framesMap[action] = [];
      for (let c = 0; c < cols; c++) {
        const sx = c * this.baseW;
        const sy = r * this.baseH;
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = this.baseW;
        frameCanvas.height = this.baseH;
        const fctx = frameCanvas.getContext("2d");
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(canvas, sx, sy, this.baseW, this.baseH, 0, 0, this.baseW, this.baseH);
        const frameKey = key + "_f" + index++;
        this.scene.textures.addBase64(frameKey, frameCanvas.toDataURL());
        framesMap[action].push({ key: frameKey });
      }
    }

    const animKeys = this.makeAnimationKeysFor(key);
    const anims = this.scene.anims;
    function makeAnim(scene, animKey, frames, fps, repeat) {
      if (!scene.anims.exists(animKey)) {
        scene.anims.create({
          key: animKey,
          frames: frames,
          frameRate: fps,
          repeat: repeat
        });
      }
    }

    makeAnim(this.scene, animKeys.idle, framesMap.idle, 6, -1);
    makeAnim(this.scene, animKeys.walk, framesMap.walk, 10, -1);
    makeAnim(this.scene, animKeys.run, framesMap.run, 12, -1);
    makeAnim(this.scene, animKeys.pitch, framesMap.pitch, 10, 0);
    makeAnim(this.scene, animKeys.swing, framesMap.swing, 12, 0);
    makeAnim(this.scene, animKeys.catch, framesMap.catch, 10, 0);

    this.registered.add(key);
    return key;
  }
}

function drawPlayerFrame(ctx, px, py, w, h, frameIndex, action, cfg) {
  const skin = cfg.skin || "#f1c27d";
  const hairColor = cfg.hairColor || cfg.hair || "#222222";
  const team = cfg.teamColor || "#2a6dd6";
  const hairStyle = cfg.hair || "short";
  const facial = cfg.facial || "none";

  ctx.clearRect(px, py, w, h);

  const cx = px + Math.floor(w / 2);
  let offsetY = 0;
  let armOffset = 0;

  if (action === "idle") {
    offsetY = frameIndex % 2 === 0 ? 0 : 1;
  } else if (action === "walk") {
    offsetY = frameIndex % 2 === 0 ? 0 : 1;
    armOffset = (frameIndex % 4) - 1;
  } else if (action === "run") {
    offsetY = frameIndex % 2 === 0 ? 0 : 1;
    armOffset = frameIndex % 2 === 0 ? -1 : 1;
  } else if (action === "pitch") {
    armOffset = frameIndex === 0 ? -2 : (frameIndex === 1 ? 0 : 2);
    offsetY = frameIndex === 1 ? -1 : 0;
  } else if (action === "swing") {
    armOffset = frameIndex === 0 ? -2 : (frameIndex === 1 ? 1 : 3);
    offsetY = frameIndex % 2 === 0 ? 0 : 1;
  } else if (action === "catch") {
    armOffset = (frameIndex % 3) - 1;
  }

  const torsoW = 6;
  const torsoH = 7;
  const torsoX = cx - Math.floor(torsoW / 2);
  const torsoY = py + 8 + offsetY;

  ctx.fillStyle = team;
  ctx.fillRect(torsoX, torsoY, torsoW, torsoH);

  ctx.fillStyle = "#333333";
  ctx.fillRect(cx - 3, torsoY + torsoH, 3, 5);
  ctx.fillRect(cx, torsoY + torsoH, 3, 5);

  const headX = cx - 2;
  const headY = torsoY - 6 + offsetY;
  ctx.fillStyle = skin;
  ctx.fillRect(headX, headY, 5, 5);

  ctx.fillStyle = hairColor;
  if (hairStyle === "short") {
    ctx.fillRect(headX, headY, 5, 2);
  } else if (hairStyle === "long") {
    ctx.fillRect(headX - 1, headY + 1, 7, 4);
  } else if (hairStyle === "mohawk") {
    ctx.fillRect(cx - 1, headY - 1, 1, 5);
  }

  ctx.fillStyle = "#222222";
  if (facial === "mustache") {
    ctx.fillRect(cx - 1, headY + 1, 3, 1);
  } else if (facial === "beard") {
    ctx.fillRect(headX, headY + 3, 5, 2);
  } else if (facial === "goatee") {
    ctx.fillRect(cx - 1, headY + 3, 3, 1);
  }

  ctx.fillStyle = "#111111";
  ctx.fillRect(cx - 1, headY + 1, 1, 1);
  ctx.fillRect(cx + 1, headY + 1, 1, 1);

  if (cfg.role === "batter" || cfg.position === "B") {
    const batX = cfg.handedness === "L" ? cx - 9 + armOffset : cx + 3 + armOffset;
    ctx.fillStyle = "#7a5c2b";
    ctx.fillRect(batX, torsoY + 1, 1, 6);
  } else if (cfg.role === "pitcher" || cfg.position === "P") {
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(cx - 7, torsoY + 1, 3, 3);
    const handSide = cfg.handedness === "R" ? 1 : -1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx + handSide * (3 + Math.max(0, armOffset)), torsoY - 1, 1, 1);
  }

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
}

/* ================================
   MATCHUP & AT-BAT LOGIC
================================= */

function getEffectivePitchRating(pitcher, pitchType) {
  if (!pitcher.pitches) return 50;
  const val = pitcher.pitches[pitchType] || 50;
  return clampAttr(val);
}

function calculateHitChance(pitcher, batter, pitchType, swingType, repeatCount) {
  const effPitch = getEffectivePitchRating(pitcher, pitchType);
  let hitChance = 50;

  hitChance -= effPitch * 0.35;
  hitChance -= (getEffectiveAttribute(pitcher, "movement") - 50) * 0.25;

  if (swingType === "contact") {
    hitChance += (getEffectiveAttribute(batter, "contact") - 50) * 0.45;
  } else if (swingType === "power") {
    hitChance += (getEffectiveAttribute(batter, "power") - 50) * 0.30;
  }

  hitChance += repeatCount * ((getEffectiveAttribute(batter, "eye") - 50) * 0.20);

  return Phaser.Math.Clamp(Math.round(hitChance), 5, 95);
}

function chooseSwingType(batter, count, runnersOn) {
  if (runnersOn > 0 && count.strikes < 2) {
    if (randInt(1, 100) <= 20) return "bunt";
  }
  if (count.strikes === 2) return "contact";

  const powerBias = getEffectiveAttribute(batter, "power");
  const roll = randInt(1, 100);
  if (roll <= powerBias * 0.7) return "power";
  return "contact";
}

function choosePitchType(pitcher, count) {
  const keys = Object.keys(pitcher.pitches || { fastball: 60 });
  if (keys.length === 0) return "fastball";

  let primary = keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (pitcher.pitches[keys[i]] > pitcher.pitches[primary]) primary = keys[i];
  }

  const roll = randInt(1, 100);
  if (count.strikes === 2 && roll <= 60) {
    const off = keys.filter(k => k !== "fastball");
    if (off.length > 0) {
      return off[randInt(0, off.length - 1)];
    }
  }

  if (roll <= 70) return primary;
  return keys[randInt(0, keys.length - 1)];
}

function checkWalk(pitcher) {
  const ctrl = getEffectiveAttribute(pitcher, "control");
  const walkChance = Math.max(2, 20 - (ctrl - 50) * 0.4);
  return randInt(1, 100) <= walkChance;
}

function resolveAtBat(pitcher, batter, count, runnersOn) {
  batter.pitchHistory = batter.pitchHistory || [];

  if (checkWalk(pitcher)) {
    return {
      outcome: "walk",
      pitchType: null,
      swingType: null
    };
  }

  const pitchType = choosePitchType(pitcher, count);
  const swingType = chooseSwingType(batter, count, runnersOn);
  const repeatCount = batter.pitchHistory.filter(p => p === pitchType).length;
  const hitChance = calculateHitChance(pitcher, batter, pitchType, swingType, repeatCount);
  const roll = randInt(1, 100);

  let outcome = "strike";
  if (swingType === "bunt") {
    if (roll <= hitChance * 0.8) outcome = "buntHit";
    else outcome = "buntOut";
  } else {
    if (roll <= hitChance) {
      const extraRoll = randInt(1, 100);
      if (swingType === "power" && extraRoll <= getEffectiveAttribute(batter, "power") * 0.15) {
        outcome = "extraBaseHit";
      } else {
        outcome = "single";
      }
    } else {
      outcome = "strike";
    }
  }

  batter.pitchHistory.push(pitchType);
  if (batter.pitchHistory.length > 3) batter.pitchHistory.shift();

  pitcher.stamina = Math.max(1, pitcher.stamina - 1);

  return {
    outcome: outcome,
    pitchType: pitchType,
    swingType: swingType
  };
}

/* ================================
   SHOP GENERATION
================================= */

const PACK_TYPES = {
  standard: { size: 3, pick: 1 },
  jumbo:    { size: 5, pick: 1 },
  ultra:    { size: 5, pick: 2 }
};

function randomRarityAtOrBelow(maxName) {
  const maxIdx = rarityIndex(maxName);
  const idx = randInt(0, maxIdx);
  return RARITIES[idx];
}

function rollRarityForPackSlot(packRarity) {
  const baseIdx = rarityIndex(packRarity);
  const roll = Math.random() * 100;
  let idx = baseIdx;
  if (roll <= 5 && baseIdx < RARITIES.length - 1) {
    idx = baseIdx + 1;
  }
  if (roll <= 0.1 && baseIdx < RARITIES.length - 2) {
    idx = baseIdx + 2;
  }
  return RARITIES[Math.min(idx, RARITIES.length - 1)];
}

function generatePerkCard(rarity) {
  const statPool = ["contact", "power", "eye", "speed", "fielding", "velocity", "movement", "control", "stamina"];
  const stat = statPool[randInt(0, statPool.length - 1)];
  let baseBoost = 1;
  if (rarity === "bronze") baseBoost = 2;
  else if (rarity === "silver") baseBoost = 3;
  else if (rarity === "gold") baseBoost = 4;
  else if (rarity === "diamond") baseBoost = 5;
  else if (rarity === "blackDiamond") baseBoost = 6;

  return {
    kind: "perkTeam",
    rarity: rarity,
    displayName: rarity.toUpperCase() + " Team Perk (" + stat + " +" + baseBoost + ")",
    stat: stat,
    amount: baseBoost
  };
}

function generateUpgradeCard(rarity) {
  const statPool = ["contact", "power", "eye", "speed", "fielding", "velocity", "movement", "control", "stamina"];
  const stat = statPool[randInt(0, statPool.length - 1)];
  let amount = 1;
  if (rarity === "bronze") amount = 2;
  else if (rarity === "silver") amount = 3;
  else if (rarity === "gold") amount = 4;
  else if (rarity === "diamond") amount = 5;
  else if (rarity === "blackDiamond") amount = 6;

  return {
    kind: "upgradeCustom",
    rarity: rarity,
    displayName: rarity.toUpperCase() + " Upgrade (" + stat + " +" + amount + ")",
    stat: stat,
    amount: amount
  };
}

function generatePlayerCard(rarity) {
  return {
    kind: "playerCard",
    rarity: rarity,
    displayName: rarity.toUpperCase() + " Player Card"
  };
}

function generateShopCardSlot(playerState) {
  const maxRarity = playerState.unlockedMaxRarity || "bronze";
  const rarity = randomRarityAtOrBelow(maxRarity);
  const kindRoll = randInt(1, 100);
  let card;
  if (kindRoll <= 50) card = generatePerkCard(rarity);
  else if (kindRoll <= 80) card = generateUpgradeCard(rarity);
  else card = generatePlayerCard(rarity);

  const rarityIdx = rarityIndex(rarity);
  const basePrice = 10 + rarityIdx * 10;
  return {
    card: card,
    price: basePrice
  };
}

function generateShopPackSlot(playerState) {
  const maxRarity = playerState.unlockedMaxRarity || "bronze";
  const rarity = randomRarityAtOrBelow(maxRarity);
  const types = ["standard", "jumbo", "ultra"];
  const packType = types[randInt(0, types.length - 1)];
  const rarityIdx = rarityIndex(rarity);
  const mult = packType === "standard" ? 1 : (packType === "jumbo" ? 1.8 : 2.3);
  const price = Math.round((15 + rarityIdx * 12) * mult);

  return {
    packType: packType,
    packRarity: rarity,
    price: price
  };
}

function openPack(packSlot, playerState) {
  const def = PACK_TYPES[packSlot.packType];
  const cards = [];
  for (let i = 0; i < def.size; i++) {
    const slotRarity = rollRarityForPackSlot(packSlot.packRarity);
    const choiceRoll = randInt(1, 100);
    if (choiceRoll <= 50) cards.push(generatePerkCard(slotRarity));
    else if (choiceRoll <= 80) cards.push(generateUpgradeCard(slotRarity));
    else cards.push(generatePlayerCard(slotRarity));
  }
  return cards;
}

/* ================================
   SCENES
================================= */

/* ---------- BootScene ---------- */
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }
  preload() {}
  create() {
    this.scene.start("TitleScene");
  }
}

/* ---------- TitleScene ---------- */
class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: "TitleScene" });
  }
  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.add.rectangle(0, 0, w * 2, h * 2, 0x0b2a3a).setOrigin(0);
    this.add.text(w / 2, h / 3, "ROGUE BASEBALL", {
      font: "36px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);
    this.add.text(w / 2, h / 3 + 60, "Click / Tap to Start", {
      font: "18px monospace",
      fill: "#d8f0ff"
    }).setOrigin(0.5);

    this.input.once("pointerdown", () => {
      this.scene.start("ProfileScene");
    });
  }
}

/* ---------- NEW ProfileScene ---------- */

class ProfileScene extends Phaser.Scene {
  constructor() {
    super({ key: "ProfileScene" });
    this.players = [];
    this.generator = null;
    this.slotContainers = [];
    this.popupRoot = null;
    this.tempCreateData = null;
    this.previewSprite = null;
  }

  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.add.rectangle(0, 0, w * 2, h * 2, 0x0b2430).setOrigin(0);
    this.add.text(w / 2, 40, "Select / Create Player", {
      font: "26px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);

    this.generator = new PixelPlayerGenerator(this);

    this.loadPlayers();
    this.renderSlots();

    this.events.on("shutdown", () => this.cleanupDOM());
    this.events.on("destroy", () => this.cleanupDOM());
  }

  /* ----- load/save ----- */

  loadPlayers() {
    try {
      this.players = JSON.parse(localStorage.getItem("players") || "[]");
    } catch (e) {
      this.players = [];
    }
    if (!Array.isArray(this.players)) this.players = [];
    if (this.players.length > 3) {
      this.players = this.players.slice(0, 3);
      localStorage.setItem("players", JSON.stringify(this.players));
    }
  }

  savePlayers() {
    localStorage.setItem("players", JSON.stringify(this.players));
  }

  cleanupDOM() {
    const oldPopup = document.getElementById("profile-popup-root");
    if (oldPopup) oldPopup.remove();
  }

  /* ----- slot render ----- */

  renderSlots() {
    if (this.slotContainers) {
      this.slotContainers.forEach(c => c.destroy());
    }
    this.slotContainers = [];

    const totalWidth = 3 * 260 + 2 * 40; // card width + gaps
    const startX = (GAME_WIDTH - totalWidth) / 2;
    const slotWidth = 260;
    const gap = 40;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (slotWidth + gap);
      const y = 120;
      const container = this.add.container(0, 0);
      this.slotContainers.push(container);

      const bg = this.add.rectangle(
        x,
        y,
        slotWidth,
        240,
        0x000000,
        0.7
      ).setOrigin(0);

      this.addSlotContent(container, bg, i);
      container.add(bg);
    }
  }

  addSlotContent(container, bgRect, index) {
    const slotPlayer = this.players[index];

    if (!slotPlayer) {
      const cx = bgRect.x + bgRect.width / 2;
      const cy = bgRect.y + bgRect.height / 2;
      const plusBox = this.add.rectangle(
        cx,
        cy,
        140,
        140,
        0x333333,
        0.7
      ).setOrigin(0.5).setInteractive();

      const plusText = this.add.text(cx, cy, "+", {
        font: "60px monospace",
        fill: "#bbbbbb"
      }).setOrigin(0.5);

      plusBox.on("pointerdown", () => {
        this.startCreateFlow(index);
      });

      container.add(plusBox);
      container.add(plusText);
      return;
    }

    const cx = bgRect.x + bgRect.width / 2;
    const keyCfg = {
      ...slotPlayer,
      role: slotPlayer.position === "P" ? "pitcher" : "batter"
    };
    const key = this.generator.generateCharacterTexture(keyCfg);
    const animKeys = this.generator.makeAnimationKeysFor(key);

    const sprite = this.add.sprite(
      cx,
      bgRect.y + 120,
      key
    ).setOrigin(0.5, 0.9).setScale(3);
    sprite.play(animKeys.idle);

    const ovr = calculateOVR(slotPlayer);

    const nameText = this.add.text(
      bgRect.x + 10,
      bgRect.y + 10,
      "Name: " + slotPlayer.name,
      { font: "14px monospace", fill: "#ffffff" }
    );
    const posText = this.add.text(
      bgRect.x + 10,
      bgRect.y + 30,
      "Pos: " + (slotPlayer.position || "P"),
      { font: "14px monospace", fill: "#ffffff" }
    );
    const ovrText = this.add.text(
      bgRect.x + 10,
      bgRect.y + 50,
      "OVR: " + ovr,
      { font: "14px monospace", fill: "#ffff00" }
    );

    const selectBtn = this.add.text(
      bgRect.x + 15,
      bgRect.y + bgRect.height - 32,
      "[ Select ]",
      { font: "14px monospace", fill: "#00ff00", backgroundColor: "#000000", padding: { x: 4, y: 2 } }
    ).setInteractive();

    selectBtn.on("pointerdown", () => {
      localStorage.setItem("currentPlayer", JSON.stringify(slotPlayer));
      this.cleanupDOM();
      this.scene.start("GameScene");
    });

    const deleteBtn = this.add.text(
      bgRect.x + bgRect.width - 100,
      bgRect.y + bgRect.height - 32,
      "[ Delete ]",
      { font: "14px monospace", fill: "#ff5555", backgroundColor: "#000000", padding: { x: 4, y: 2 } }
    ).setInteractive();

    deleteBtn.on("pointerdown", () => {
      if (confirm("Delete this player?")) {
        this.players.splice(index, 1);
        this.savePlayers();
        this.renderSlots();
      }
    });

    container.add(sprite);
    container.add(nameText);
    container.add(posText);
    container.add(ovrText);
    container.add(selectBtn);
    container.add(deleteBtn);
  }

  /* ----- create flow entry ----- */

  startCreateFlow(slotIndex) {
    if (this.players.length >= 3 && !this.players[slotIndex]) {
      alert("All 3 slots are filled. Delete one to create a new player.");
      return;
    }
    this.tempCreateData = {
      slotIndex,
      name: "Player",
      position: "P",
      throwHand: "R",
      batHand: "R",
      teamColor: "#2a6dd6",
      hair: "short",
      hairColor: "#222222",
      facial: "none",
      skin: "#f1c27d",
      stats: {}
    };
    this.showBasicInfoPopup();
  }

  showPopup(htmlContent) {
    this.cleanupDOM();
    const div = document.createElement("div");
    div.id = "profile-popup-root";
    div.style.position = "fixed";
    div.style.left = "0";
    div.style.top = "0";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.background = "rgba(0,0,0,0.6)";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.zIndex = "50";
    div.style.fontFamily = "monospace";
    div.innerHTML = htmlContent;
    document.body.appendChild(div);
    this.popupRoot = div;
  }

  /* ----- STEP 1: BASIC INFO ----- */

  showBasicInfoPopup() {
    const data = this.tempCreateData;
    const html = `
      <div style="background:#102030;padding:16px;border-radius:10px;color:#fff;min-width:320px;max-width:420px;">
        <div style="font-size:18px;margin-bottom:8px;">Create Player — Step 1/3</div>
        <div style="margin-bottom:6px;">
          Name:
          <input id="cp_name" value="${data.name}" style="width:180px;margin-left:4px;" />
        </div>
        <div style="margin-bottom:6px;">
          Position:
          <select id="cp_pos" style="margin-left:4px;">
            <option value="P">P</option>
            <option value="C">C</option>
            <option value="1B">1B</option>
            <option value="2B">2B</option>
            <option value="3B">3B</option>
            <option value="SS">SS</option>
            <option value="LF">LF</option>
            <option value="CF">CF</option>
            <option value="RF">RF</option>
          </select>
        </div>
        <div style="margin-bottom:6px;">
          Throw Hand:
          <select id="cp_throw" style="margin-left:4px;">
            <option value="R">R</option>
            <option value="L">L</option>
          </select>
        </div>
        <div id="cp_bat_row" style="margin-bottom:6px;">
          Bat Hand:
          <select id="cp_bat" style="margin-left:4px;">
            <option value="R">R</option>
            <option value="L">L</option>
          </select>
        </div>
        <div style="margin-bottom:6px;">
          Team Color:
          <input id="cp_team" type="color" value="${data.teamColor}" />
        </div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
          <button id="cp_cancel" class="small-btn">Cancel</button>
          <button id="cp_next" class="small-btn">Continue</button>
        </div>
      </div>
    `;
    this.showPopup(html);

    const posSel = document.getElementById("cp_pos");
    const batRow = document.getElementById("cp_bat_row");

    posSel.value = data.position || "P";

    const updateBatVisibility = () => {
      const v = posSel.value;
      batRow.style.display = (v === "P") ? "none" : "block";
    };
    updateBatVisibility();
    posSel.onchange = updateBatVisibility;

    document.getElementById("cp_throw").value = data.throwHand || "R";
    document.getElementById("cp_team").value = data.teamColor || "#2a6dd6";

    document.getElementById("cp_cancel").onclick = () => {
      this.tempCreateData = null;
      this.cleanupDOM();
    };

    document.getElementById("cp_next").onclick = () => {
      data.name = document.getElementById("cp_name").value || "Player";
      data.position = document.getElementById("cp_pos").value;
      data.throwHand = document.getElementById("cp_throw").value;
      data.teamColor = document.getElementById("cp_team").value;
      if (data.position === "P") {
        data.batHand = data.throwHand;
      } else {
        data.batHand = document.getElementById("cp_bat").value;
      }
      this.showAttributePopup();
    };
  }

  /* ----- STEP 2: ATTRIBUTES (Exact 60 OVR) ----- */

  getStatKeysForPosition() {
    const pos = this.tempCreateData.position;
    if (pos === "P") {
      return ["velocity", "movement", "control", "stamina"];
    }
    return ["contact", "power", "eye", "speed", "fielding"];
  }

  getTargetTotalForPosition() {
    const pos = this.tempCreateData.position;
    if (pos === "P") return 240; // 4 stats * 60
    return 300;                   // 5 stats * 60
  }

  initPresetStats() {
    const data = this.tempCreateData;
    const pos = data.position;
    const stats = {};
    if (pos === "P") {
      // Example preset totaling 240
      stats.velocity = 65;
      stats.movement = 58;
      stats.control  = 57;
      stats.stamina  = 60;
    } else {
      // Example preset totaling 300
      stats.contact = 55;
      stats.power   = 65;
      stats.eye     = 58;
      stats.speed   = 60;
      stats.fielding= 62;
    }
    data.stats = stats;
  }

  showAttributePopup() {
    const data = this.tempCreateData;
    if (!data.stats || Object.keys(data.stats).length === 0) {
      this.initPresetStats();
    }
    const keys = this.getStatKeysForPosition();
    const targetTotal = this.getTargetTotalForPosition();

    const rowsHtml = keys.map(k => {
      const label = k.toUpperCase();
      const val = data.stats[k];
      return `
        <div style="margin-bottom:6px;display:flex;align-items:center;gap:6px;">
          <div style="width:90px;">${label}</div>
          <button data-stat="${k}" data-dir="-1" class="small-btn">-</button>
          <span id="stat_val_${k}">${val}</span>
          <button data-stat="${k}" data-dir="1" class="small-btn">+</button>
        </div>
      `;
    }).join("");

    const html = `
      <div style="background:#102030;padding:16px;border-radius:10px;color:#fff;min-width:320px;max-width:430px;">
        <div style="font-size:18px;margin-bottom:8px;">Attributes — Step 2/3</div>
        <div style="font-size:12px;margin-bottom:10px;">Adjust your stats. Average must be 60 (total ${targetTotal}).</div>
        ${rowsHtml}
        <div id="attr_total" style="margin-top:8px;font-size:14px;"></div>
        <div id="attr_error" style="margin-top:4px;font-size:12px;color:#ff7777;"></div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
          <button id="attr_cancel" class="small-btn">Cancel</button>
          <button id="attr_next" class="small-btn" disabled>Continue</button>
        </div>
      </div>
    `;
    this.showPopup(html);

    const updateTotals = () => {
      const stats = data.stats;
      const total = keys.reduce((t, k) => t + stats[k], 0);
      const ovr = this.previewOVRFromStats();
      const totalEl = document.getElementById("attr_total");
      const errEl = document.getElementById("attr_error");
      const nextBtn = document.getElementById("attr_next");

      totalEl.textContent = `Total: ${total} / ${targetTotal} • OVR: ${ovr}`;

      if (total === targetTotal) {
        errEl.textContent = "";
        nextBtn.disabled = false;
      } else if (total > targetTotal) {
        errEl.textContent = "Too many points assigned. Lower some stats.";
        nextBtn.disabled = true;
      } else {
        errEl.textContent = "You still have points left to assign.";
        nextBtn.disabled = true;
      }
    };

    const buttons = this.popupRoot.querySelectorAll("button[data-stat]");
    buttons.forEach(btn => {
      btn.onclick = () => {
        const stat = btn.getAttribute("data-stat");
        const dir = parseInt(btn.getAttribute("data-dir"), 10);
        const current = data.stats[stat];
        const newVal = current + dir;
        if (newVal < 1) return;
        if (newVal > 99) return;
        data.stats[stat] = newVal;
        document.getElementById("stat_val_" + stat).textContent = newVal;
        updateTotals();
      };
    });

    document.getElementById("attr_cancel").onclick = () => {
      this.tempCreateData = null;
      this.cleanupDOM();
    };

    document.getElementById("attr_next").onclick = () => {
      this.showSpritePopup();
    };

    updateTotals();
  }

  previewOVRFromStats() {
    const data = this.tempCreateData;
    const pos = data.position;
    const p = { position: pos };
    const keys = this.getStatKeysForPosition();
    keys.forEach(k => {
      p[k] = data.stats[k];
    });
    return calculateOVR(p);
  }

  /* ----- STEP 3: SPRITE CREATOR ----- */

  showSpritePopup() {
    const data = this.tempCreateData;
    const html = `
      <div style="background:#102030;padding:16px;border-radius:10px;color:#fff;min-width:340px;max-width:460px;">
        <div style="font-size:18px;margin-bottom:8px;">Appearance — Step 3/3</div>
        <div style="margin-bottom:6px;">
          Hair Style:
          <select id="sp_hair">
            <option value="short">short</option>
            <option value="long">long</option>
            <option value="mohawk">mohawk</option>
            <option value="bald">bald</option>
          </select>
        </div>
        <div style="margin-bottom:6px;">
          Hair Color:
          <input id="sp_hair_color" type="color" value="${data.hairColor}" />
        </div>
        <div style="margin-bottom:6px;">
          Skin:
          <input id="sp_skin" type="color" value="${data.skin}" />
        </div>
        <div style="margin-bottom:6px;">
          Facial Hair:
          <select id="sp_facial">
            <option value="none">none</option>
            <option value="mustache">mustache</option>
            <option value="beard">beard</option>
            <option value="goatee">goatee</option>
          </select>
        </div>
        <div style="margin-bottom:6px;">
          Team Color:
          <input id="sp_team" type="color" value="${data.teamColor}" />
        </div>
        <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
          <button id="sp_cancel" class="small-btn">Cancel</button>
          <button id="sp_create" class="small-btn">Create Player</button>
        </div>
      </div>
    `;
    this.showPopup(html);

    document.getElementById("sp_hair").value = data.hair || "short";
    document.getElementById("sp_skin").value = data.skin || "#f1c27d";
    document.getElementById("sp_team").value = data.teamColor || "#2a6dd6";

    const applyAndPreview = () => {
      data.hair = document.getElementById("sp_hair").value;
      data.hairColor = document.getElementById("sp_hair_color").value;
      data.skin = document.getElementById("sp_skin").value;
      data.facial = document.getElementById("sp_facial").value;
      data.teamColor = document.getElementById("sp_team").value;
      this.updatePreviewSpriteFromTemp();
    };

    ["sp_hair", "sp_hair_color", "sp_skin", "sp_facial", "sp_team"].forEach(id => {
      document.getElementById(id).onchange = applyAndPreview;
    });

    document.getElementById("sp_cancel").onclick = () => {
      this.tempCreateData = null;
      this.destroyPreviewSprite();
      this.cleanupDOM();
    };

    document.getElementById("sp_create").onclick = () => {
      this.finishCreatePlayer();
    };

    applyAndPreview();
  }

  updatePreviewSpriteFromTemp() {
    const data = this.tempCreateData;
    if (!data) return;

    const cfg = {
      id: "preview",
      name: data.name,
      position: data.position,
      handedness: data.throwHand,
      hair: data.hair,
      hairColor: data.hairColor,
      skin: data.skin,
      facial: data.facial,
      teamColor: data.teamColor,
      role: data.position === "P" ? "pitcher" : "batter"
    };

    const key = this.generator.generateCharacterTexture(cfg);
    const animKeys = this.generator.makeAnimationKeysFor(key);

    if (!this.previewSprite) {
      this.previewSprite = this.add.sprite(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 140,
        key
      ).setOrigin(0.5, 0.9).setScale(3).setDepth(30);
    } else {
      this.previewSprite.setTexture(key);
    }
    this.previewSprite.play(animKeys.idle);
  }

  destroyPreviewSprite() {
    if (this.previewSprite) {
      this.previewSprite.destroy();
      this.previewSprite = null;
    }
  }

  /* ----- finalize create ----- */

  finishCreatePlayer() {
    const d = this.tempCreateData;
    if (!d) return;

    const player = {
      id: "pl_" + Date.now() + "_" + Math.floor(Math.random() * 9999),
      name: d.name,
      position: d.position,
      handedness: d.throwHand,
      batHand: d.batHand,
      hair: d.hair,
      hairColor: d.hairColor,
      skin: d.skin,
      facial: d.facial,
      teamColor: d.teamColor,
      rarity: "common",
      level: 1,
      xp: 0,
      xpToNextLevel: 10,
      currency: 50,
      unlockedMaxRarity: "common",
      bossCount: 0,
      perksApplied: {},
      perksOwned: [],
      pitches: {
        fastball: 60,
        slider: 55,
        curveball: 55,
        changeup: 55
      }
    };

    // baseline attributes
    player.velocity = 40;
    player.movement = 40;
    player.control  = 40;
    player.stamina  = 40;
    player.contact  = 40;
    player.power    = 40;
    player.eye      = 40;
    player.speed    = 40;
    player.fielding = 40;

    // apply custom stats
    const keys = this.getStatKeysForPosition();
    keys.forEach(k => {
      player[k] = d.stats[k];
    });

    ["velocity","movement","control","stamina",
     "contact","power","eye","speed","fielding"].forEach(attr => {
      player.perksApplied[attr] = 0;
    });

    player.ovr = calculateOVR(player);

    const idx = d.slotIndex;
    if (this.players[idx]) {
      this.players[idx] = player;
    } else {
      this.players.push(player);
    }
    this.savePlayers();

    localStorage.setItem("currentPlayer", JSON.stringify(player));

    this.tempCreateData = null;
    this.destroyPreviewSprite();
    this.cleanupDOM();
    this.renderSlots();
  }
}

/* ---------- GameScene (Main Gameplay) ---------- */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.generator = null;
    this.defenders = [];
    this.runners = [];
  }

  init() {
    this.generator = new PixelPlayerGenerator(this);
  }

  create() {
    try {
      this.currentPlayer = JSON.parse(localStorage.getItem("currentPlayer") || "null");
    } catch (e) {
      this.currentPlayer = null;
    }
    if (!this.currentPlayer) {
      this.scene.start("ProfileScene");
      return;
    }

    this.gameState = {
      inning: 1,
      half: "top",
      outs: 0,
      score: { visiting: 0, home: 0 },
      teamPlayers: []
    };

    this.add.rectangle(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x2f7f3c).setOrigin(0);

    this.defenders = [];
    const defenderPositions = this.getDefenderPositions();
    for (let i = 0; i < 9; i++) {
      const clone = JSON.parse(JSON.stringify(this.currentPlayer));
      clone.id = clone.id + "_def" + i;
      clone.position = "F";
      clone.role = "fielder";
      clone.contact = clampAttr(clone.contact + randInt(-5, 5));
      clone.power = clampAttr(clone.power + randInt(-5, 5));
      const obj = this.createPlayerSprite(defenderPositions[i].x, defenderPositions[i].y, clone);
      this.defenders.push(obj);
      this.gameState.teamPlayers.push(clone);
    }

    const pClone = JSON.parse(JSON.stringify(this.currentPlayer));
    pClone.id = pClone.id + "_pitch";
    pClone.position = "P";
    pClone.role = "pitcher";
    this.pitcherObj = this.createPlayerSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, pClone);
    this.gameState.teamPlayers.push(pClone);

    const bClone = JSON.parse(JSON.stringify(this.currentPlayer));
    bClone.id = bClone.id + "_batt";
    bClone.position = "B";
    bClone.role = "batter";
    this.batterObj = this.createPlayerSprite(GAME_WIDTH / 2, GAME_HEIGHT - 120, bClone);

    this.ball = this.add.circle(-50, -50, 4, 0xffffff).setVisible(false);
    this.physics.add.existing(this.ball);
    this.ball.body.setCircle(4);

    this.cameras.main.setBounds(0, 0, GAME_WIDTH * 1.5, GAME_HEIGHT * 1.5);
    this.cameras.main.startFollow(this.batterObj.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.0);

    this.createScorebug();
    this.createScoreLabel();
    this.createShopButton();
    this.createPlayerCard();

    this.input.keyboard.on("keydown-SPACE", () => {
      this.triggerAtBat();
    });
    this.input.on("pointerdown", () => {
      this.triggerAtBat();
    });

    this.bases = this.getBasesLayout();
  }

  getDefenderPositions() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 40;
    return [
      { x: cx, y: cy - 130 },
      { x: cx - 150, y: cy - 80 },
      { x: cx + 150, y: cy - 80 },
      { x: cx - 90, y: cy + 10 },
      { x: cx + 90, y: cy + 10 },
      { x: cx - 30, y: cy + 70 },
      { x: cx + 30, y: cy + 70 },
      { x: cx - 30, y: cy + 120 },
      { x: cx + 30, y: cy + 120 }
    ];
  }

  getBasesLayout() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 10;
    return {
      home: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 110 },
      first: { x: cx + 130, y: cy + 80 },
      second: { x: cx, y: cy - 110 },
      third: { x: cx - 130, y: cy + 80 }
    };
  }

  createPlayerSprite(x, y, cfg) {
    const key = this.generator.generateCharacterTexture(cfg);
    const sprite = this.add.sprite(x, y, key).setOrigin(0.5, 0.9);
    sprite.setScale(this.generator.scale);
    const animKeys = this.generator.makeAnimationKeysFor(key);
    sprite.play(animKeys.idle);

    return { sprite: sprite, cfg: cfg, key: key, animKeys: animKeys };
  }

  createScorebug() {
    this.scorebug = this.add.text(10, 10, "", {
      font: "14px monospace",
      fill: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(50);
    this.updateScorebug();
  }

  updateScorebug() {
    const gs = this.gameState;
    this.scorebug.setText(
      "Inning: " + gs.inning + " (" + gs.half + ")" +
      "\nOuts: " + gs.outs +
      "\nScore: V " + gs.score.visiting + " - H " + gs.score.home
    );
  }

  createScoreLabel() {
    this.scoreLabel = this.add.text(GAME_WIDTH / 2 - 200, 10, "", {
      font: "16px monospace",
      fill: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(50);
    this.updateScoreLabel();
  }

  updateScoreLabel() {
    this.scoreLabel.setText("Player: " + this.currentPlayer.name + "   Coins: " + this.currentPlayer.currency);
  }

  createShopButton() {
    this.shopBtn = this.add.text(GAME_WIDTH - 140, 10, "Shop", {
      font: "16px monospace",
      fill: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setScrollFactor(0).setDepth(50).setInteractive();

    this.shopBtn.on("pointerdown", () => {
      this.openShopBetweenPlays();
    });
  }

  createPlayerCard() {
    if (this.cardContainer) this.cardContainer.destroy();
    this.cardContainer = this.add.container(10, GAME_HEIGHT - 220).setScrollFactor(0).setDepth(40);

    const bg = this.add.rectangle(0, 0, 280, 200, 0x000000, 0.65).setOrigin(0);
    this.cardContainer.add(bg);

    const keyCfg = {
      ...this.currentPlayer,
      role: "pitcher"
    };
    const key = this.generator.generateCharacterTexture(keyCfg);
    const animKeys = this.generator.makeAnimationKeysFor(key);

    const sprite = this.add.sprite(50, 80, key).setOrigin(0.5).setScale(3);
    sprite.play(animKeys.idle);
    this.cardContainer.add(sprite);

    const nameText = this.add.text(100, 10, this.currentPlayer.name, {
      font: "14px monospace",
      fill: "#ffffff"
    });
    this.cardContainer.add(nameText);

    const coinsText = this.add.text(100, 30, "Coins: " + this.currentPlayer.currency, {
      font: "12px monospace",
      fill: "#ffff00"
    });
    this.cardContainer.add(coinsText);

    const attrs = ["velocity", "movement", "control", "stamina"];
    const barX = 100;
    const barW = 150;
    const barH = 10;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const y = 60 + i * 24;
      const base = this.currentPlayer[attr] || 0;
      const bonus = (this.currentPlayer.perksApplied && this.currentPlayer.perksApplied[attr]) || 0;
      const total = clampAttr(base + bonus);

      const baseWidth = Math.round((base / 99) * barW);
      const bonusWidth = Math.round(((total - base) / 99) * barW);

      const label = this.add.text(10, y - 8, attr.toUpperCase(), {
        font: "10px monospace",
        fill: "#ffffff"
      });
      this.cardContainer.add(label);

      const baseBar = this.add.rectangle(barX, y, baseWidth, barH, 0x5555ff).setOrigin(0, 0.5);
      this.cardContainer.add(baseBar);

      if (bonusWidth > 0) {
        const bonusBar = this.add.rectangle(barX + baseWidth, y, bonusWidth, barH, 0xffff00).setOrigin(0, 0.5);
        this.cardContainer.add(bonusBar);
      }

      const numText = this.add.text(barX + barW + 4, y - 8, "" + total, {
        font: "10px monospace",
        fill: "#ffffff"
      });
      this.cardContainer.add(numText);
    }
  }

  triggerAtBat() {
    if (this.atBatInProgress) return;
    this.atBatInProgress = true;

    const pitcher = this.pitcherObj.cfg;
    const batter = this.batterObj.cfg;
    const count = { balls: 0, strikes: 0 };
    const runnersOn = 0;

    const result = resolveAtBat(pitcher, batter, count, runnersOn);

    const startX = this.pitcherObj.sprite.x;
    const startY = this.pitcherObj.sprite.y - 10;
    const midX = this.batterObj.sprite.x + randInt(-20, 20);
    const midY = this.batterObj.sprite.y - 10;

    this.ball.setPosition(startX, startY).setVisible(true);
    this.ball.body.reset(startX, startY);

    const duration = 350;
    this.cameras.main.startFollow(this.ball, true, 0.1, 0.1);
    this.cameras.main.zoomTo(1.2, 250);

    this.tweens.add({
      targets: this.ball,
      x: midX,
      y: midY,
      duration: duration,
      onComplete: () => {
        this.handleAtBatResultAnimation(result);
      }
    });
  }

  handleAtBatResultAnimation(result) {
    const outcome = result.outcome;
    if (outcome === "walk") {
      this.currentPlayer.currency += 2;
      this.showFloatingCoins("+2 coins");
      this.updateScoreLabel();
      this.resetAfterPlay();
    } else if (outcome === "strike" || outcome === "buntOut") {
      this.gameState.outs++;
      this.updateScorebug();
      this.resetAfterPlay();
    } else if (outcome === "single" || outcome === "buntHit") {
      this.currentPlayer.currency += 3;
      this.showFloatingCoins("+3 coins");
      this.updateScoreLabel();
      this.resetAfterPlay();
    } else if (outcome === "extraBaseHit") {
      this.currentPlayer.currency += 6;
      this.showFloatingCoins("+6 coins");
      this.updateScoreLabel();
      this.resetAfterPlay();
    } else {
      this.resetAfterPlay();
    }
  }

  showFloatingCoins(text) {
    const div = document.createElement("div");
    div.className = "floating-text";
    div.textContent = text;
    div.style.left = "200px";
    div.style.top = "60px";
    document.body.appendChild(div);

    setTimeout(() => {
      div.style.transition = "all 1s ease-out";
      div.style.opacity = "0";
      div.style.transform = "translateY(-40px)";
    }, 10);

    setTimeout(() => {
      div.remove();
    }, 1100);
  }

  resetAfterPlay() {
    this.ball.setVisible(false);
    this.ball.body.reset(-50, -50);
    this.cameras.main.startFollow(this.batterObj.sprite, true, 0.08, 0.08);
    this.cameras.main.zoomTo(1.0, 250);
    this.atBatInProgress = false;

    if (this.gameState.outs >= 3) {
      this.endHalfInning();
    }
  }

  endHalfInning() {
    this.showScoreboardOverlay();

    this.gameState.outs = 0;
    this.gameState.half = this.gameState.half === "top" ? "bottom" : "top";
    if (this.gameState.half === "top") {
      this.gameState.inning++;
    }

    this.time.delayedCall(1200, () => {
      this.openShopBetweenPlays();
    });
  }

  showScoreboardOverlay() {
    const gs = this.gameState;
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    const panel = this.add.container(w / 2, h / 2).setDepth(60);
    const bg = this.add.rectangle(0, 0, 480, 260, 0x000000, 0.9).setOrigin(0.5);
    panel.add(bg);

    const title = this.add.text(-180, -100, "SCOREBOARD", {
      font: "20px monospace",
      fill: "#ffffff"
    });
    panel.add(title);

    const lines = [
      "Inning: " + gs.inning + " (" + gs.half + ")",
      "Score: V " + gs.score.visiting + " - H " + gs.score.home,
      "Outs: " + gs.outs
    ];
    for (let i = 0; i < lines.length; i++) {
      const t = this.add.text(-180, -60 + 30 * i, lines[i], {
        font: "16px monospace",
        fill: "#ffffff"
      });
      panel.add(t);
    }

    this.time.delayedCall(1200, () => {
      panel.destroy();
    });
  }

  openShopBetweenPlays() {
    this.scene.pause();
    this.scene.launch("ShopScene", { parentKey: "GameScene" });
  }
}

/* ---------- ShopScene ---------- */

class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: "ShopScene" });
    this.playerState = null;
    this.currentPlayer = null;
  }

  init(data) {
    this.parentKey = data && data.parentKey ? data.parentKey : "GameScene";
  }

  create() {
    try {
      this.currentPlayer = JSON.parse(localStorage.getItem("currentPlayer") || "null");
    } catch (e) {
      this.currentPlayer = null;
    }
    if (!this.currentPlayer) {
      this.closeShop();
      return;
    }

    this.playerState = {
      unlockedMaxRarity: this.currentPlayer.unlockedMaxRarity || "bronze",
      bossCount: this.currentPlayer.bossCount || 0
    };

    this.add.rectangle(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x0b2430).setOrigin(0);
    this.add.text(20, 20, "SHOP", { font: "22px monospace", fill: "#ffffff" });

    this.shopRound = {
      cardSlots: [
        generateShopCardSlot(this.playerState),
        generateShopCardSlot(this.playerState),
        generateShopCardSlot(this.playerState)
      ],
      packSlots: [
        generateShopPackSlot(this.playerState),
        generateShopPackSlot(this.playerState)
      ]
    };

    this.renderShopUI();
  }

  renderShopUI() {
    if (this.uiContainer) this.uiContainer.destroy();
    this.uiContainer = this.add.container(0, 0);

    const startX = 60;
    const startY = 80;
    for (let i = 0; i < 3; i++) {
      const slot = this.shopRound.cardSlots[i];
      const x = startX + i * 300;
      const y = startY;
      const rect = this.add.rectangle(x, y, 240, 120, 0x000000, 0.7).setOrigin(0).setInteractive();
      const border = this.add.rectangle(x + 120, y + 60, 236, 116, 0xffffff).setOrigin(0.5);
      border.setStrokeStyle(2, 0xffffff);
      const title = this.add.text(x + 10, y + 10, slot.card.displayName, {
        font: "14px monospace",
        fill: "#ffffff"
      });
      const price = this.add.text(x + 10, y + 36, "Price: " + slot.price, {
        font: "12px monospace",
        fill: "#ffffff"
      });
      rect.on("pointerdown", () => {
        this.showCardPreview(slot);
      });
      this.uiContainer.add(rect);
      this.uiContainer.add(border);
      this.uiContainer.add(title);
      this.uiContainer.add(price);
    }

    const packStartX = 160;
    const packStartY = 240;
    for (let i = 0; i < 2; i++) {
      const slot = this.shopRound.packSlots[i];
      const x = packStartX + i * 400;
      const y = packStartY;
      const rect = this.add.rectangle(x, y, 360, 120, 0x000000, 0.7).setOrigin(0).setInteractive();
      const border = this.add.rectangle(x + 180, y + 60, 356, 116, 0xffffff).setOrigin(0.5);
      border.setStrokeStyle(2, 0xffffff);
      const title = this.add.text(x + 10, y + 10, slot.packType.toUpperCase() + " PACK (" + slot.packRarity + ")", {
        font: "14px monospace",
        fill: "#ffffff"
      });
      const price = this.add.text(x + 10, y + 36, "Price: " + slot.price, {
        font: "12px monospace",
        fill: "#ffffff"
      });
      rect.on("pointerdown", () => {
        this.showPackPreview(slot);
      });
      this.uiContainer.add(rect);
      this.uiContainer.add(border);
      this.uiContainer.add(title);
      this.uiContainer.add(price);
    }

    const back = this.add.text(20, GAME_HEIGHT - 50, "Back", {
      font: "16px monospace",
      fill: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive().setScrollFactor(0);
    back.on("pointerdown", () => {
      this.closeShop();
    });
    this.uiContainer.add(back);

    this.renderPlayerPreview();
  }

  renderPlayerPreview() {
    if (this.previewContainer) this.previewContainer.destroy();
    this.previewContainer = this.add.container(GAME_WIDTH - 340, 50);

    const bg = this.add.rectangle(0, 0, 320, 360, 0x000000, 0.7).setOrigin(0);
    this.previewContainer.add(bg);

    const gen = new PixelPlayerGenerator(this);
    const keyCfg = {
      ...this.currentPlayer,
      role: "batter"
    };
    const key = gen.generateCharacterTexture(keyCfg);
    const animKeys = gen.makeAnimationKeysFor(key);
    const sprite = this.add.sprite(60, 80, key).setOrigin(0.5).setScale(3);
    sprite.play(animKeys.idle);
    this.previewContainer.add(sprite);

    this.previewContainer.add(this.add.text(120, 10, this.currentPlayer.name, {
      font: "16px monospace",
      fill: "#ffffff"
    }));

    const attrs = ["contact", "power", "eye", "speed", "fielding"];
    const barX = 100;
    const barW = 180;
    const barH = 10;

    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const y = 60 + i * 28;
      const base = this.currentPlayer[attr] || 0;
      const bonus = (this.currentPlayer.perksApplied && this.currentPlayer.perksApplied[attr]) || 0;
      const total = clampAttr(base + bonus);

      const baseWidth = Math.round((base / 99) * barW);
      const bonusWidth = Math.round(((total - base) / 99) * barW);

      const label = this.add.text(10, y - 8, attr.toUpperCase(), {
        font: "10px monospace",
        fill: "#ffffff"
      });
      this.previewContainer.add(label);

      const baseBar = this.add.rectangle(barX, y, baseWidth, barH, 0x5555ff).setOrigin(0, 0.5);
      this.previewContainer.add(baseBar);

      if (bonusWidth > 0) {
        const bonusBar = this.add.rectangle(barX + baseWidth, y, bonusWidth, barH, 0xffff00).setOrigin(0, 0.5);
        this.previewContainer.add(bonusBar);
      }

      const numText = this.add.text(barX + barW + 4, y - 8, "" + total, {
        font: "10px monospace",
        fill: "#ffffff"
      });
      this.previewContainer.add(numText);
    }

    this.previewContainer.add(this.add.text(10, 320, "Coins: " + this.currentPlayer.currency, {
      font: "14px monospace",
      fill: "#ffff00"
    }));
  }

  showCardPreview(slot) {
    if (this.previewPanel) this.previewPanel.destroy();
    this.previewPanel = this.add.container(60, GAME_HEIGHT - 220).setDepth(80);

    const bg = this.add.rectangle(0, 0, GAME_WIDTH - 120, 200, 0x000000, 0.85).setOrigin(0);
    this.previewPanel.add(bg);

    const card = slot.card;

    this.previewPanel.add(this.add.text(20, 10, card.displayName, {
      font: "18px monospace",
      fill: "#ffffff"
    }));

    this.previewPanel.add(this.add.text(20, 50, "Kind: " + card.kind, {
      font: "14px monospace",
      fill: "#ffffff"
    }));

    this.previewPanel.add(this.add.text(20, 70, "Rarity: " + card.rarity, {
      font: "14px monospace",
      fill: "#ffffff"
    }));

    this.previewPanel.add(this.add.text(20, 90, "Price: " + slot.price, {
      font: "14px monospace",
      fill: "#ffffff"
    }));

    const buy = this.add.text(400, 140, "Buy", {
      font: "16px monospace",
      fill: "#00ff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();
    buy.on("pointerdown", () => {
      this.buyCard(slot);
    });
    this.previewPanel.add(buy);

    const back = this.add.text(320, 140, "Back", {
      font: "16px monospace",
      fill: "#ffff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();
    back.on("pointerdown", () => {
      this.previewPanel.destroy();
    });
    this.previewPanel.add(back);
  }

  buyCard(slot) {
    if (this.currentPlayer.currency < slot.price) {
      alert("Not enough coins.");
      return;
    }
    this.currentPlayer.currency -= slot.price;

    const card = slot.card;
    if (card.kind === "perkTeam") {
      const gameScene = this.scene.get("GameScene");
      if (gameScene && gameScene.gameState && gameScene.gameState.teamPlayers) {
        applyPerkToTeam(gameScene.gameState.teamPlayers, card.stat, card.amount);
      }
    } else if (card.kind === "upgradeCustom") {
      applyUpgradeToCustom(this.currentPlayer, card.stat, card.amount);
    } else if (card.kind === "playerCard") {
      this.currentPlayer.perksOwned = this.currentPlayer.perksOwned || [];
      this.currentPlayer.perksOwned.push(card);
    }

    localStorage.setItem("currentPlayer", JSON.stringify(this.currentPlayer));
    this.previewPanel.destroy();
    this.renderShopUI();
  }

  showPackPreview(packSlot) {
    if (this.previewPanel) this.previewPanel.destroy();
    this.previewPanel = this.add.container(60, GAME_HEIGHT - 220).setDepth(80);

    const bg = this.add.rectangle(0, 0, GAME_WIDTH - 120, 200, 0x000000, 0.85).setOrigin(0);
    this.previewPanel.add(bg);

    this.previewPanel.add(this.add.text(20, 10,
      packSlot.packType.toUpperCase() + " PACK (" + packSlot.packRarity + ")",
      { font: "18px monospace", fill: "#ffffff" }
    ));

    this.previewPanel.add(this.add.text(20, 50, "Price: " + packSlot.price, {
      font: "14px monospace",
      fill: "#ffffff"
    }));

    const buy = this.add.text(420, 140, "Open Pack", {
      font: "16px monospace",
      fill: "#00ff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    buy.on("pointerdown", () => {
      this.buyPack(packSlot);
    });

    const back = this.add.text(320, 140, "Back", {
      font: "16px monospace",
      fill: "#ffff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    back.on("pointerdown", () => {
      this.previewPanel.destroy();
    });

    this.previewPanel.add(buy);
    this.previewPanel.add(back);
  }

  buyPack(packSlot) {
    if (this.currentPlayer.currency < packSlot.price) {
      alert("Not enough coins.");
      return;
    }
    this.currentPlayer.currency -= packSlot.price;

    const cards = openPack(packSlot, this.playerState);
    this.previewPanel.destroy();
    this.showPackReveal(packSlot, cards);
  }

  showPackReveal(packSlot, cards) {
    if (this.packPanel) this.packPanel.destroy();
    this.packPanel = this.add.container(40, 320).setDepth(90);

    const def = PACK_TYPES[packSlot.packType];
    const bg = this.add.rectangle(0, 0, GAME_WIDTH - 80, 260, 0x000000, 0.9).setOrigin(0);
    this.packPanel.add(bg);

    const title = this.add.text(20, 10,
      "Choose " + def.pick + " card(s)",
      { font: "18px monospace", fill: "#ffffff" }
    );
    this.packPanel.add(title);

    const chosen = [];
    const maxPick = def.pick;

    cards.forEach((card, index) => {
      const x = 20 + index * 200;
      const y = 50;
      const rect = this.add.rectangle(x, y, 180, 180, 0x111111, 0.85).setOrigin(0).setInteractive();
      const label = this.add.text(x + 10, y + 10, card.displayName, {
        font: "12px monospace",
        fill: "#ffffff"
      });

      rect.on("pointerdown", () => {
        if (chosen.indexOf(index) !== -1) return;
        if (chosen.length >= maxPick) return;
        chosen.push(index);
        rect.setFillStyle(0x226622, 0.95);
      });

      this.packPanel.add(rect);
      this.packPanel.add(label);
    });

    const confirm = this.add.text(20, 220, "Confirm", {
      font: "16px monospace",
      fill: "#00ff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    confirm.on("pointerdown", () => {
      if (chosen.length === 0) return;
      chosen.forEach(ci => {
        const c = cards[ci];
        if (c.kind === "perkTeam") {
          const gameScene = this.scene.get("GameScene");
          if (gameScene && gameScene.gameState && gameScene.gameState.teamPlayers) {
            applyPerkToTeam(gameScene.gameState.teamPlayers, c.stat, c.amount);
          }
        } else if (c.kind === "upgradeCustom") {
          applyUpgradeToCustom(this.currentPlayer, c.stat, c.amount);
        } else if (c.kind === "playerCard") {
          this.currentPlayer.perksOwned = this.currentPlayer.perksOwned || [];
          this.currentPlayer.perksOwned.push(c);
        }
      });
      localStorage.setItem("currentPlayer", JSON.stringify(this.currentPlayer));
      this.packPanel.destroy();
      this.renderShopUI();
    });

    const cancel = this.add.text(120, 220, "Cancel", {
      font: "16px monospace",
      fill: "#ffff00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    cancel.on("pointerdown", () => {
      this.packPanel.destroy();
      this.renderShopUI();
    });

    this.packPanel.add(confirm);
    this.packPanel.add(cancel);
  }

  closeShop() {
    localStorage.setItem("currentPlayer", JSON.stringify(this.currentPlayer));
    this.scene.stop();
    this.scene.resume(this.parentKey || "GameScene");
    const gameScene = this.scene.get("GameScene");
    if (gameScene) {
      gameScene.currentPlayer = this.currentPlayer;
      gameScene.createPlayerCard();
      gameScene.updateScoreLabel();
    }
  }
}

/* ================================
   GAME CONFIG & START
================================= */

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-container",
  backgroundColor: "#2a5a3a",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: { debug: false }
  },
  scene: [BootScene, TitleScene, ProfileScene, GameScene, ShopScene]
};

const game = new Phaser.Game(config);
