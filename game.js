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
function computeOverall(player) {
  // For pitchers, only use pitching attributes
  let attrs;
  if (player && player.position === "P") {
    attrs = ["velocity", "movement", "control", "stamina"];
  } else {
    // For everyone else, use hitter attributes
    attrs = ["contact", "power", "eye", "speed", "fielding"];
  }

  let sum = 0;
  let count = 0;
  attrs.forEach(a => {
    if (typeof player[a] === "number") {
      sum += player[a];
      count++;
    }
  });
  if (count === 0) return 60;
  return Math.round(sum / count);
}

// Rarity → overall range
const RARITY_OVR_RANGES = {
  common: [50, 59],
  bronze: [60, 69],
  silver: [70, 79],
  gold: [80, 89],
  diamond: [90, 98],
  blackDiamond: [99, 99]
};

function getOvrRangeForRarity(rarity) {
  const r = RARITY_OVR_RANGES[rarity];
  return r ? r.slice() : [50, 59];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function isPitcherPosition(pos) {
  return pos === "P";
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
  // base helper to bias towards mid-60s / 70s
  function base(min, max) {
    return clampAttr(randInt(min, max));
  }

  const p = {
    id: "pl_" + Date.now() + "_" + randInt(1000, 9999),
    name: name || "Player",
    position: position || "P",
    handedness: handedness || "R",
    // we'll add separate bat/throw hands later if needed
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
    perksApplied: {},   // stat -> amount from perks (additive)
    perksOwned: []
  };

  // Initialize perk overlays
  ["velocity", "movement", "control", "stamina",
   "contact", "power", "eye", "speed", "fielding"].forEach(attr => {
    p.perksApplied[attr] = 0;
  });

  // compute overall (average of 9 attributes)
  p.overall = computeOverall(p);

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

  // torso
  ctx.fillStyle = team;
  ctx.fillRect(torsoX, torsoY, torsoW, torsoH);

  // legs
  ctx.fillStyle = "#333333";
  ctx.fillRect(cx - 3, torsoY + torsoH, 3, 5);
  ctx.fillRect(cx, torsoY + torsoH, 3, 5);

  // head
  const headX = cx - 2;
  const headY = torsoY - 6 + offsetY;
  ctx.fillStyle = skin;
  ctx.fillRect(headX, headY, 5, 5);

  // hair
  ctx.fillStyle = hairColor;
  if (hairStyle === "short") {
    ctx.fillRect(headX, headY, 5, 2);
  } else if (hairStyle === "long") {
    ctx.fillRect(headX - 1, headY + 1, 7, 4);
  } else if (hairStyle === "mohawk") {
    ctx.fillRect(cx - 1, headY - 1, 1, 5);
  }

  // facial hair
  ctx.fillStyle = "#222222";
  if (facial === "mustache") {
    ctx.fillRect(cx - 1, headY + 1, 3, 1);
  } else if (facial === "beard") {
    ctx.fillRect(headX, headY + 3, 5, 2);
  } else if (facial === "goatee") {
    ctx.fillRect(cx - 1, headY + 3, 3, 1);
  }

  // eyes
  ctx.fillStyle = "#111111";
  ctx.fillRect(cx - 1, headY + 1, 1, 1);
  ctx.fillRect(cx + 1, headY + 1, 1, 1);

  // equip
  if (cfg.role === "batter" || cfg.position === "B") {
    const batX = cfg.handedness === "L" ? cx - 9 + armOffset : cx + 3 + armOffset;
    ctx.fillStyle = "#7a5c2b";
    ctx.fillRect(batX, torsoY + 1, 1, 6);
  } else if (cfg.role === "pitcher" || cfg.position === "P") {
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(cx - 7, torsoY + 1, 3, 3); // glove
    const handSide = cfg.handedness === "R" ? 1 : -1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx + handSide * (3 + Math.max(0, armOffset)), torsoY - 1, 1, 1);
  }

  // outline
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
}

/* ================================
   PIXEL PLAYER GENERATOR (FIXED)
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

  // SAFELY SANITIZE TEXTURE KEYS
  clean(str) {
    return (str || "").toString().replace(/[^a-zA-Z0-9]/g, "");
  }

  keyFor(cfg) {
    return [
      "char",
      this.clean(cfg.id || cfg.name || "anon"),
      this.clean(cfg.position || "X"),
      this.clean(cfg.handedness || "R"),
      this.clean(cfg.skin || "skin"),
      this.clean(cfg.hair || "hair"),
      this.clean(cfg.hairColor || "hclr"),
      this.clean(cfg.facial || "face"),
      this.clean(cfg.teamColor || "team")
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
    const cols = Math.max(...actions.map(a => this.animFrames[a]));
    const rows = actions.length;

    const canvas = document.createElement("canvas");
    canvas.width = this.baseW * cols;
    canvas.height = this.baseH * rows;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // DRAW ALL FRAMES
    for (let r = 0; r < rows; r++) {
      const action = actions[r];
      const frames = this.animFrames[action];

      for (let f = 0; f < frames; f++) {
        drawPlayerFrame(ctx, f * this.baseW, r * this.baseH, this.baseW, this.baseH, f, action, cfg);
      }

      // Pad row so all have equal length
      for (let f = frames; f < cols; f++) {
        ctx.drawImage(
          canvas,
          (frames - 1) * this.baseW,
          r * this.baseH,
          this.baseW,
          this.baseH,
          f * this.baseW,
          r * this.baseH,
          this.baseW,
          this.baseH
        );
      }
    }

    // SLICE INTO INDIVIDUAL PHASER TEXTURES
    let frameIndex = 0;
    const framesMap = {};

    actions.forEach((action, r) => {
      framesMap[action] = [];
      for (let c = 0; c < cols; c++) {
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = this.baseW;
        frameCanvas.height = this.baseH;
        const fctx = frameCanvas.getContext("2d");
        fctx.imageSmoothingEnabled = false;

        fctx.drawImage(
          canvas,
          c * this.baseW,
          r * this.baseH,
          this.baseW,
          this.baseH,
          0,
          0,
          this.baseW,
          this.baseH
        );

        const frameKey = key + "_f" + frameIndex++;

        // SAFELY REGISTER FRAME
        if (this.scene.textures.exists(frameKey)) {
          this.scene.textures.remove(frameKey);
        }

        this.scene.textures.addCanvas(frameKey, frameCanvas);

        framesMap[action].push({ key: frameKey });
      }
    });

    // CREATE ANIMATIONS
    const animKeys = this.makeAnimationKeysFor(key);

    const createAnim = (name, frames, fps, repeat) => {
      if (!this.scene.anims.exists(name)) {
        this.scene.anims.create({
          key: name,
          frames: frames,
          frameRate: fps,
          repeat: repeat
        });
      }
    };

    createAnim(animKeys.idle, framesMap.idle, 6, -1);
    createAnim(animKeys.walk, framesMap.walk, 10, -1);
    createAnim(animKeys.run, framesMap.run, 12, -1);
    createAnim(animKeys.pitch, framesMap.pitch, 10, 0);
    createAnim(animKeys.swing, framesMap.swing, 12, 0);
    createAnim(animKeys.catch, framesMap.catch, 10, 0);

    this.registered.add(key);
    return key;
  }
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
   CHAOTIC ATTRIBUTE GENERATION
================================= */

function generateBaseAttributes(attrKeys, targetOvr) {
  const attrs = {};
  attrKeys.forEach(k => {
    attrs[k] = clampAttr(randInt(targetOvr - 5, targetOvr + 5));
  });
  balanceAttributesToOvr(attrs, targetOvr);
  return attrs;
}

function balanceAttributesToOvr(attrs, targetOvr) {
  const keys = Object.keys(attrs);
  const n = keys.length;
  const targetSum = targetOvr * n;

  let sum = 0;
  keys.forEach(k => { sum += attrs[k]; });

  let diff = Math.round(targetSum - sum);
  let safety = 0;

  while (diff !== 0 && safety < 1000) {
    const idx = randInt(0, n - 1);
    const key = keys[idx];
    const val = attrs[key];

    if (diff > 0) {
      if (val >= 99) {
        safety++;
        continue;
      }
      attrs[key] = val + 1;
      diff--;
    } else {
      if (val <= 1) {
        safety++;
        continue;
      }
      attrs[key] = val - 1;
      diff++;
    }
    safety++;
  }
}

function applyVarianceModel(attrs, targetOvr) {
  const keys = Object.keys(attrs);
  const n = keys.length;
  if (n === 0) return attrs;

  const roll = Math.random();

  // CHAOS: 1% chance
  if (roll < 0.01 && n >= 3) {
    const spikeIdx = randInt(0, n - 1);
    let tankIdx1 = spikeIdx;
    let tankIdx2 = spikeIdx;
    while (tankIdx1 === spikeIdx) tankIdx1 = randInt(0, n - 1);
    while (tankIdx2 === spikeIdx || tankIdx2 === tankIdx1) tankIdx2 = randInt(0, n - 1);

    const spikeKey = keys[spikeIdx];
    const tankKey1 = keys[tankIdx1];
    const tankKey2 = keys[tankIdx2];

    attrs[spikeKey] = clampAttr(randInt(Math.max(95, targetOvr), 99));
    attrs[tankKey1] = clampAttr(randInt(15, 35));
    attrs[tankKey2] = clampAttr(randInt(15, 35));

    balanceAttributesToOvr(attrs, targetOvr);
    return attrs;
  }

  // Double spike: additional 5% (total 6%)
  if (roll < 0.06 && n >= 2) {
    let idx1 = 0;
    let idx2 = 0;
    while (idx2 === idx1) idx2 = randInt(0, n - 1);

    const key1 = keys[idx1];
    const key2 = keys[idx2];

    attrs[key1] = clampAttr(attrs[key1] + randInt(8, 15));
    attrs[key2] = clampAttr(attrs[key2] + randInt(8, 15));

    balanceAttributesToOvr(attrs, targetOvr);
    return attrs;
  }

  // Spike/Tank: next 10% (total 16%)
  if (roll < 0.16 && n >= 2) {
    const spikeIdx = randInt(0, n - 1);
    let tankIdx = spikeIdx;
    while (tankIdx === spikeIdx) tankIdx = randInt(0, n - 1);

    const spikeKey = keys[spikeIdx];
    const tankKey = keys[tankIdx];

    const spikeBoost = randInt(10, 20);
    attrs[spikeKey] = clampAttr(attrs[spikeKey] + spikeBoost);
    attrs[tankKey] = clampAttr(attrs[tankKey] - spikeBoost);

    balanceAttributesToOvr(attrs, targetOvr);
    return attrs;
  }

  // Most players: just slightly noisy balanced stats
  balanceAttributesToOvr(attrs, targetOvr);
  return attrs;
}

function generateRandomDraftPlayer(position, rarity, teamColorOverride) {
  const [minOvr, maxOvr] = getOvrRangeForRarity(rarity);
  const targetOvr = randInt(minOvr, maxOvr);
  const pitcher = isPitcherPosition(position);

  const hitterAttrs = ["contact", "power", "eye", "speed", "fielding"];
  const pitcherAttrs = ["velocity", "movement", "control", "stamina"];
  const keys = pitcher ? pitcherAttrs : hitterAttrs;

  // 1) Base balanced attributes around target overall
  let attrs = generateBaseAttributes(keys, targetOvr);

  // 2) Apply chaos / spike / double-spike logic
  attrs = applyVarianceModel(attrs, targetOvr);

  // 3) Cosmetic/random appearance
  const name = "Player " + randInt(100, 999);

  const hairStyles = ["short", "long", "mohawk", "bald"];
  const facialStyles = ["none", "mustache", "beard", "goatee"];
  const hairColors = ["#222222", "#8b4513", "#d2b48c", "#ffa500"];
  const skinColors = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  const fallbackTeamColors = ["#2a6dd6", "#b22222", "#228b22", "#8b008b", "#ff8c00", "#444444"];

  const hair = hairStyles[randInt(0, hairStyles.length - 1)];
  const facial = facialStyles[randInt(0, facialStyles.length - 1)];
  const hairColor = hairColors[randInt(0, hairColors.length - 1)];
  const skin = skinColors[randInt(0, skinColors.length - 1)];
  const teamColor = teamColorOverride || fallbackTeamColors[randInt(0, fallbackTeamColors.length - 1)];

  // 4) Hands / handedness
  const throwHand = Math.random() < 0.5 ? "R" : "L";
  let batHand;
  if (pitcher) {
    // Pitchers bat R or L, but no switch emphasis
    batHand = Math.random() < 0.5 ? "R" : "L";
  } else {
    // Hitters: some chance to be switch
    const r = Math.random();
    if (r < 0.10) batHand = "S";
    else if (r < 0.55) batHand = "R";
    else batHand = "L";
  }

  // 5) Start from base player to keep structure consistent
  const base = makeNewPlayer(
    name,
    position,
    batHand,    // handedness for base; we'll override below as needed
    hair,
    skin,
    facial,
    teamColor
  );

  // 6) Override fields precisely for our draft player
  base.throwHand = throwHand;
  base.batHand = batHand;
  base.handedness = pitcher ? throwHand : batHand;

  base.hair = hair;
  base.hairColor = hairColor;
  base.skin = skin;
  base.facial = facial;
  base.teamColor = teamColor;

  base.position = position;
  base.role = pitcher ? "pitcher" : "batter";
  base.rarity = rarity;

  // 7) Apply our generated attributes
  keys.forEach(k => {
    base[k] = attrs[k];
  });

  // 8) Compute overall using your position-based logic
  base.overall = computeOverall(base);

  return base;
}


/* ================================
   SCENES
================================= */

/* ---------- BootScene ---------- */
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: "BootScene" });
    }

    preload() {
        // Load the baseball field background
        this.load.image("field", "field.png");
    }

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

/* ---------- ProfileScene (Save Slots) ---------- */
class ProfileScene extends Phaser.Scene {
  constructor() {
    super({ key: "ProfileScene" });
    this.slots = [null, null, null];
  }

  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.add.rectangle(0, 0, w * 2, h * 2, 0x0b2430).setOrigin(0);
    this.add.text(w / 2, 40, "Select Profile", {
      font: "28px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);

    this.loadPlayers();
    this.renderSlots();

    const backHint = this.add.text(w / 2, h - 30, "Click a slot to play / create", {
      font: "16px monospace",
      fill: "#d0f0ff"
    }).setOrigin(0.5);
  }

  loadPlayers() {
    try {
      const arr = JSON.parse(localStorage.getItem("players") || "[]");
      this.slots = [arr[0] || null, arr[1] || null, arr[2] || null];
    } catch (e) {
      this.slots = [null, null, null];
    }
  }

  savePlayers() {
    localStorage.setItem("players", JSON.stringify(this.slots));
  }

  renderSlots() {
    if (this.slotContainer) this.slotContainer.destroy();
    this.slotContainer = this.add.container(0, 0);

    const w = this.cameras.main.width;
    const startY = 120;
    const gapY = 130;

    for (let i = 0; i < 3; i++) {
      const x = w / 2 - 250;
      const y = startY + i * gapY;
      const slotRect = this.add.rectangle(x, y, 500, 110, 0x000000, 0.7)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0xffffff)
        .setInteractive();

      const slotIndex = i;
      const player = this.slots[slotIndex];

      if (player) {
        const label = `${player.name}  |  POS: ${player.position || "P"}  |  OVR: ${player.overall || computeOverall(player)}`;
        const txt = this.add.text(x + 16, y + 14, label, {
          font: "18px monospace",
          fill: "#ffffff"
        });

        const lvlText = this.add.text(x + 16, y + 42, `Level: ${player.level || 1}   Coins: ${player.currency || 0}`, {
          font: "14px monospace",
          fill: "#d0f0ff"
        });

        const playBtn = this.makeButton(x + 16, y + 70, "Play", () => {
  // set current profile
  localStorage.setItem("currentPlayer", JSON.stringify(player));

  // check if this profile already has a roster
  const rosterKey = "roster_" + player.id;
  const existingRoster = localStorage.getItem(rosterKey);

  if (existingRoster) {
    // load roster and go to main hub
    localStorage.setItem("currentRoster", existingRoster);
    this.scene.start("MainMenuScene");
  } else {
    // no roster yet → go draft a team
    this.scene.start("DraftScene");
  }
});


        const deleteBtn = this.makeButton(x + 100, y + 70, "Delete", () => {
          if (confirm("Delete this profile?")) {
            this.slots[slotIndex] = null;
            this.savePlayers();
            this.renderSlots();
          }
        });

        this.slotContainer.add(slotRect);
        this.slotContainer.add(txt);
        this.slotContainer.add(lvlText);
        this.slotContainer.add(playBtn);
        this.slotContainer.add(deleteBtn);

        // small preview sprite on the right
        const gen = new PixelPlayerGenerator(this);
        const key = gen.generateCharacterTexture(player);
        const animKeys = gen.makeAnimationKeysFor(key);
        const sprite = this.add.sprite(x + 430, y + 55, key).setOrigin(0.5).setScale(2);
        sprite.play(animKeys.idle);
        this.slotContainer.add(sprite);

      } else {
        // empty slot
        const plus = this.add.text(x + 220, y + 35, "+", {
          font: "48px monospace",
          fill: "#888888"
        }).setOrigin(0.5);

        const label = this.add.text(x + 16, y + 20, "Empty Slot - Click to Create", {
          font: "18px monospace",
          fill: "#cccccc"
        });

        slotRect.on("pointerdown", () => {
          this.startCreatePlayer(slotIndex);
        });

        this.slotContainer.add(slotRect);
        this.slotContainer.add(plus);
        this.slotContainer.add(label);
      }
    }
  }

  makeButton(x, y, text, onClick) {
    const btn = this.add.text(x, y, text, {
      font: "16px monospace",
      fill: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    btn.on("pointerdown", () => {
      onClick();
    });

    return btn;
  }

  startCreatePlayer(slotIndex) {
    this.scene.start("CreatePlayerScene", { slotIndex: slotIndex });
  }
}
/* ---------- CreatePlayerScene (3-step creator) ---------- */
/* ---------- CreatePlayerScene (3-step creator, improved) ---------- */
class CreatePlayerScene extends Phaser.Scene {
  constructor() {
    super({ key: "CreatePlayerScene" });
    this.step = 1;
    this.optionPopup = null;
  }

  init(data) {
    this.slotIndex = data && typeof data.slotIndex === "number" ? data.slotIndex : 0;

    // base config
    this.config = {
      name: "New Player",
      position: "P",
      throwHand: "R",
      batHand: "R",
      hair: "short",
      hairColor: "#222222",
      facial: "none",
      skin: "#f1c27d",
      teamColor: "#2a6dd6"
    };

    // full stat object; step 2 will only use a subset based on position
    this.stats = {
      contact: 60,
      power: 60,
      eye: 60,
      speed: 60,
      fielding: 60,
      velocity: 60,
      movement: 60,
      control: 60,
      stamina: 60
    };

    // Presets split between pitchers and hitters
    // All presets sum to 60 * number_of_relevant_stats
    this.pitcherPresets = {
      balanced: {
        velocity: 60, movement: 60, control: 60, stamina: 60
      },
      acePitcher: {
        velocity: 65, movement: 60, control: 65, stamina: 50  // total 240
      },
      controlSpecialist: {
        velocity: 55, movement: 60, control: 80, stamina: 45  // 240
      },
      powerArm: {
        velocity: 80, movement: 65, control: 45, stamina: 50  // 240
      }
    };

    this.hitterPresets = {
      balanced: {
        contact: 60, power: 60, eye: 60, speed: 60, fielding: 60
      },
      powerBat: {
        contact: 55, power: 80, eye: 55, speed: 50, fielding: 60  // 300
      },
      speedster: {
        contact: 70, power: 40, eye: 55, speed: 80, fielding: 55  // 300
      },
      contactHitter: {
        contact: 80, power: 45, eye: 70, speed: 60, fielding: 45  // 300
      }
    };
  }

  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.add.rectangle(0, 0, w * 2, h * 2, 0x081620).setOrigin(0);

    this.titleText = this.add.text(w / 2, 40, "Create Player", {
      font: "26px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);

    this.stepContainer = this.add.container(0, 0);
    this.errorText = this.add.text(w / 2, h - 40, "", {
      font: "16px monospace",
      fill: "#ff8080"
    }).setOrigin(0.5);

    this.showStep1();
  }

  clearStep() {
    if (this.stepContainer) {
      this.stepContainer.destroy();
      this.stepContainer = this.add.container(0, 0);
    }
    this.errorText.setText("");
  }

  /* ---------- STEP 1: Basics ---------- */
  showStep1() {
    this.step = 1;
    this.clearStep();
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const cx = w / 2;
    const cy = h / 2;

    const panel = this.add.rectangle(cx, cy, 640, 380, 0x000000, 0.85)
      .setStrokeStyle(2, 0xffffff);
    this.stepContainer.add(panel);

    const header = this.add.text(cx, cy - 160, "Step 1: Basics", {
      font: "22px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);
    this.stepContainer.add(header);

    // Name
    const nameLabel = this.add.text(cx - 260, cy - 110, "Name:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(nameLabel);

    const nameValue = this.add.text(cx - 160, cy - 110, this.config.name, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
    nameValue.on("pointerdown", () => {
      const newName = prompt("Enter player name:", this.config.name);
      if (newName && newName.trim().length > 0) {
        this.config.name = newName.trim();
        nameValue.setText(this.config.name);
      }
    });
    this.stepContainer.add(nameValue);

    // Position (popup list)
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
    const posLabel = this.add.text(cx - 260, cy - 70, "Position:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(posLabel);

    const posValue = this.add.text(cx - 160, cy - 70, this.config.position, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
    posValue.on("pointerdown", () => {
      const opts = positions.map(p => ({ label: p, value: p }));
      this.showOptionPopup("Select Position", opts, (choice) => {
        this.config.position = choice;
        posValue.setText(choice);
      });
    });
    this.stepContainer.add(posValue);

    // Throw / Bat (popup)
    const handLabel = this.add.text(cx - 260, cy - 30, "Throw / Bat:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(handLabel);

    const throwVal = this.add.text(cx - 140, cy - 30, "THR: " + this.config.throwHand, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
    throwVal.on("pointerdown", () => {
      const opts = [
        { label: "Right (R)", value: "R" },
        { label: "Left (L)", value: "L" }
      ];
      this.showOptionPopup("Select Throw Hand", opts, (choice) => {
        this.config.throwHand = choice;
        throwVal.setText("THR: " + choice);
      });
    });
    this.stepContainer.add(throwVal);

    const batVal = this.add.text(cx + 10, cy - 30, "BAT: " + this.config.batHand, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
   batVal.on("pointerdown", () => {
  const opts = [
    { label: "Right (R)", value: "R" },
    { label: "Left (L)", value: "L" },
    { label: "Switch (S)", value: "S" }
  ];
  this.showOptionPopup("Select Bat Hand", opts, (choice) => {
    this.config.batHand = choice;
    batVal.setText("BAT: " + choice);
  });
});

    this.stepContainer.add(batVal);

    // Hair style
    const hairStyles = ["short", "long", "mohawk", "bald"];
    const hairLabel = this.add.text(cx - 260, cy + 10, "Hair:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(hairLabel);

    const hairVal = this.add.text(cx - 160, cy + 10, this.config.hair, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
    hairVal.on("pointerdown", () => {
      const opts = hairStyles.map(h => ({ label: h, value: h }));
      this.showOptionPopup("Select Hair Style", opts, (choice) => {
        this.config.hair = choice;
        hairVal.setText(choice);
      });
    });
    this.stepContainer.add(hairVal);

    // Facial hair
    const facialStyles = ["none", "mustache", "beard", "goatee"];
    const facialLabel = this.add.text(cx - 260, cy + 50, "Facial Hair:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(facialLabel);

    const facialVal = this.add.text(cx - 160, cy + 50, this.config.facial, {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 }
    }).setInteractive();
    facialVal.on("pointerdown", () => {
      const opts = facialStyles.map(f => ({ label: f, value: f }));
      this.showOptionPopup("Select Facial Hair", opts, (choice) => {
        this.config.facial = choice;
        facialVal.setText(choice);
      });
    });
    this.stepContainer.add(facialVal);

    // Skin & Team color (palette list)
    const skinColors = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
    const teamColors = ["#2a6dd6", "#b22222", "#228b22", "#8b008b", "#ff8c00", "#444444"];

    const skinLabel = this.add.text(cx + 40, cy - 110, "Skin:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(skinLabel);

    const skinVal = this.add.text(cx + 120, cy - 110, "Tap", {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: this.config.skin,
      padding: { x: 10, y: 6 }
    }).setInteractive();
    skinVal.on("pointerdown", () => {
      const opts = skinColors.map((c, idx) => ({
        label: "Tone " + (idx + 1),
        value: c,
        color: c
      }));
      this.showOptionPopup("Select Skin Tone", opts, (choice) => {
        this.config.skin = choice;
        skinVal.setBackgroundColor(choice);
      });
    });
    this.stepContainer.add(skinVal);

    const teamLabel = this.add.text(cx + 40, cy - 70, "Team Color:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(teamLabel);

    const teamVal = this.add.text(cx + 160, cy - 70, "Tap", {
      font: "16px monospace",
      fill: "#ffffaa",
      backgroundColor: this.config.teamColor,
      padding: { x: 10, y: 6 }
    }).setInteractive();
    teamVal.on("pointerdown", () => {
      const opts = teamColors.map((c, idx) => ({
        label: "Color " + (idx + 1),
        value: c,
        color: c
      }));
      this.showOptionPopup("Select Team Color", opts, (choice) => {
        this.config.teamColor = choice;
        teamVal.setBackgroundColor(choice);
      });
    });
    this.stepContainer.add(teamVal);

    // Navigation buttons
    const backBtn = this.makeButton(cx - 200, cy + 140, "Back to Profiles", () => {
      this.scene.start("ProfileScene");
    });
    const nextBtn = this.makeButton(cx + 140, cy + 140, "Next: Attributes", () => {
      this.showStep2();
    });

    this.stepContainer.add(backBtn);
    this.stepContainer.add(nextBtn);
  }

  /* ---------- STEP 2: Attribute Allocation ---------- */
  showStep2() {
    this.step = 2;
    this.clearStep();
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const cx = w / 2;
    const cy = h / 2;

    const isPitcher = (this.config.position === "P");
    const attrs = isPitcher
      ? ["velocity", "movement", "control", "stamina"]
      : ["contact", "power", "eye", "speed", "fielding"];

    this.targetTotal = attrs.length * 60;

    const panel = this.add.rectangle(cx, cy, 740, 430, 0x000000, 0.9)
      .setStrokeStyle(2, 0xffffff);
    this.stepContainer.add(panel);

    const header = this.add.text(cx, cy - 190, "Step 2: Attributes (60 OVR)", {
      font: "22px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);
    this.stepContainer.add(header);

    // Preset buttons (depending on role)
    const presetDefs = isPitcher
      ? [
          { key: "balanced", label: "Balanced" },
          { key: "acePitcher", label: "Ace Pitcher" },
          { key: "controlSpecialist", label: "Control" },
          { key: "powerArm", label: "Power Arm" }
        ]
      : [
          { key: "balanced", label: "Balanced" },
          { key: "powerBat", label: "Power Bat" },
          { key: "speedster", label: "Speedster" },
          { key: "contactHitter", label: "Contact" }
        ];

    presetDefs.forEach((p, idx) => {
      const btn = this.makeButton(cx - 320 + idx * 180, cy - 150, p.label, () => {
        this.applyPreset(p.key);
        this.showStep2(); // re-render with updated stats
      });
      this.stepContainer.add(btn);
    });

    // Stats list
    const leftX = cx - 300;
    const topY = cy - 110;
    const rowH = 36;

    attrs.forEach((attr, index) => {
      const y = topY + index * rowH;
      const label = this.add.text(leftX, y, attr.toUpperCase() + ":", {
        font: "16px monospace",
        fill: "#ffffff"
      });
      this.stepContainer.add(label);

      const minusBtn = this.makeButton(leftX + 190, y, "-", () => {
        this.adjustStat(attr, -1);
      });
      const valText = this.add.text(leftX + 230, y, this.stats[attr].toString(), {
        font: "16px monospace",
        fill: "#ffffaa"
      });
      const plusBtn = this.makeButton(leftX + 280, y, "+", () => {
        this.adjustStat(attr, +1);
      });

      this.stepContainer.add(minusBtn);
      this.stepContainer.add(valText);
      this.stepContainer.add(plusBtn);
    });

    const total = this.currentTotal(attrs);
    const remaining = this.targetTotal - total;

    const totalText = this.add.text(cx - 100, cy + 90,
      "Total Points: " + total + "  (Target: " + this.targetTotal + ")", {
        font: "16px monospace",
        fill: "#ffffff"
      });
    const remainText = this.add.text(cx - 100, cy + 120,
      "Points Remaining: " + remaining, {
        font: "16px monospace",
        fill: remaining === 0 ? "#80ff80" : "#ff8080"
      });

    this.stepContainer.add(totalText);
    this.stepContainer.add(remainText);

    const backBtn = this.makeButton(cx - 200, cy + 160, "Back: Basics", () => {
      this.showStep1();
    });
    const nextBtn = this.makeButton(cx + 140, cy + 160, "Next: Appearance", () => {
      if (this.targetTotal - this.currentTotal(attrs) !== 0) {
        this.errorText.setText("You must allocate exactly 60 OVR (all points used) before continuing.");
        return;
      }
      this.showStep3();
    });

    this.stepContainer.add(backBtn);
    this.stepContainer.add(nextBtn);
  }

  applyPreset(key) {
    const isPitcher = (this.config.position === "P");
    const source = isPitcher ? this.pitcherPresets : this.hitterPresets;
    const preset = source[key];
    if (!preset) return;

    Object.keys(preset).forEach(attr => {
      this.stats[attr] = clampAttr(preset[attr]);
    });
  }

  currentTotal(attrList) {
    if (Array.isArray(attrList)) {
      return attrList.reduce((sum, a) => sum + (this.stats[a] || 0), 0);
    }
    return Object.values(this.stats).reduce((a, b) => a + b, 0);
  }

  adjustStat(attr, delta) {
    const isPitcher = (this.config.position === "P");
    const attrs = isPitcher
      ? ["velocity", "movement", "control", "stamina"]
      : ["contact", "power", "eye", "speed", "fielding"];

    const current = this.stats[attr];
    if (current == null) return;

    const newVal = clampAttr(current + delta);
    const newStats = { ...this.stats, [attr]: newVal };
    const total = attrs.reduce((sum, a) => sum + (newStats[a] || 0), 0);

    if (total > this.targetTotal) {
      // can't go over allowed pool
      return;
    }

    this.stats[attr] = newVal;
    this.showStep2(); // re-render
  }

  /* ---------- STEP 3: Appearance + Preview ---------- */
  showStep3() {
    this.step = 3;
    this.clearStep();
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const cx = w / 2;
    const cy = h / 2;

    const panel = this.add.rectangle(cx, cy, 740, 430, 0x000000, 0.9)
      .setStrokeStyle(2, 0xffffff);
    this.stepContainer.add(panel);

    const header = this.add.text(cx, cy - 190, "Step 3: Appearance & Confirm", {
      font: "22px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);
    this.stepContainer.add(header);

    const isPitcher = (this.config.position === "P");
    const handedness = isPitcher ? this.config.throwHand : this.config.batHand;

    // Live sprite preview
    const gen = new PixelPlayerGenerator(this);
    const previewCfg = {
      name: this.config.name,
      position: this.config.position,
      handedness: handedness || "R",
      hair: this.config.hair,
      hairColor: this.config.hairColor || "#222222",
      facial: this.config.facial,
      skin: this.config.skin,
      teamColor: this.config.teamColor,
      role: isPitcher ? "pitcher" : "batter"
    };
    const texKey = gen.generateCharacterTexture(previewCfg);
    const animKeys = gen.makeAnimationKeysFor(texKey);
    const sprite = this.add.sprite(cx - 230, cy - 40, texKey).setOrigin(0.5).setScale(3);
    sprite.play(animKeys.idle);
    this.stepContainer.add(sprite);

    const infoText = this.add.text(cx - 120, cy - 80,
      `${this.config.name}\nPOS: ${this.config.position}   BAT: ${this.config.batHand}   THR: ${this.config.throwHand}`,
      {
        font: "16px monospace",
        fill: "#ffffff"
      }
    );
    this.stepContainer.add(infoText);

    // Expanded appearance options using popup lists
    const hairColors = ["#222222", "#8b4513", "#d2b48c", "#ffa500"];
    const jerseyColors = ["#2a6dd6", "#b22222", "#228b22", "#8b008b", "#ff8c00", "#444444"];

    const hairColorLabel = this.add.text(cx - 120, cy - 20, "Hair Color:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(hairColorLabel);

    const hairColorBtn = this.makeButton(cx + 20, cy - 22, "Change", () => {
      const opts = hairColors.map((c, idx) => ({
        label: "Hair " + (idx + 1),
        value: c,
        color: c
      }));
      this.showOptionPopup("Select Hair Color", opts, (choice) => {
        this.config.hairColor = choice;
        previewCfg.hairColor = choice;
        const newKey = gen.generateCharacterTexture(previewCfg);
        const newAnimKeys = gen.makeAnimationKeysFor(newKey);
        sprite.setTexture(newKey);
        sprite.play(newAnimKeys.idle);
      });
    });
    this.stepContainer.add(hairColorBtn);

    const jerseyLabel = this.add.text(cx - 120, cy + 20, "Jersey Color:", {
      font: "16px monospace",
      fill: "#ffffff"
    });
    this.stepContainer.add(jerseyLabel);

    const jerseyBtn = this.makeButton(cx + 20, cy + 18, "Change", () => {
      const opts = jerseyColors.map((c, idx) => ({
        label: "Jersey " + (idx + 1),
        value: c,
        color: c
      }));
      this.showOptionPopup("Select Jersey Color", opts, (choice) => {
        this.config.teamColor = choice;
        previewCfg.teamColor = choice;
        const newKey = gen.generateCharacterTexture(previewCfg);
        const newAnimKeys = gen.makeAnimationKeysFor(newKey);
        sprite.setTexture(newKey);
        sprite.play(newAnimKeys.idle);
      });
    });
    this.stepContainer.add(jerseyBtn);

    const noteText = this.add.text(cx - 120, cy + 70,
      "You can tweak hair/jersey colors here.\nWhen ready, press Finish to save this player.",
      {
        font: "14px monospace",
        fill: "#cccccc"
      }
    );
    this.stepContainer.add(noteText);

    const backBtn = this.makeButton(cx - 200, cy + 160, "Back: Attributes", () => {
      this.showStep2();
    });
    const finishBtn = this.makeButton(cx + 140, cy + 160, "Finish & Save", () => {
      this.finishCreatePlayer();
    });

    this.stepContainer.add(backBtn);
    this.stepContainer.add(finishBtn);
  }

  makeButton(x, y, text, onClick) {
    const btn = this.add.text(x, y, text, {
      font: "16px monospace",
      fill: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setInteractive();

    btn.on("pointerdown", () => {
      onClick();
    });

    return btn;
  }

  // Generic popup list for selecting options
  showOptionPopup(title, options, onSelect) {
    if (this.optionPopup) {
      this.optionPopup.destroy();
      this.optionPopup = null;
    }

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const cx = w / 2;
    const cy = h / 2;

    const panelHeight = 100 + options.length * 26;

    const container = this.add.container(0, 0).setDepth(200);
    const bg = this.add.rectangle(cx, cy, 360, panelHeight, 0x000000, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff);
    container.add(bg);

    const titleText = this.add.text(cx, cy - panelHeight / 2 + 20, title, {
      font: "18px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);
    container.add(titleText);

    options.forEach((opt, idx) => {
      let label, value, color;
      if (typeof opt === "string") {
        label = opt;
        value = opt;
        color = null;
      } else {
        label = opt.label;
        value = opt.value;
        color = opt.color || null;
      }

      const ty = cy - panelHeight / 2 + 50 + idx * 24;
      const txt = this.add.text(ty, ty, "", {}); // placeholder to avoid confusion
      txt.destroy(); // (we'll create proper text below)

      const optionText = this.add.text(cx, ty, label, {
        font: "16px monospace",
        fill: "#ffffaa",
        backgroundColor: color || "#000000",
        padding: { x: 6, y: 2 }
      }).setOrigin(0.5).setInteractive();

      optionText.on("pointerdown", () => {
        onSelect(value);
        container.destroy();
        this.optionPopup = null;
      });

      container.add(optionText);
    });

    const cancelY = cy + panelHeight / 2 - 24;
    const cancel = this.add.text(cx, cancelY, "Cancel", {
      font: "16px monospace",
      fill: "#ff8080",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    }).setOrigin(0.5).setInteractive();

    cancel.on("pointerdown", () => {
      container.destroy();
      this.optionPopup = null;
    });

    container.add(cancel);
    this.optionPopup = container;
  }

  finishCreatePlayer() {
    // Build base from makeNewPlayer to keep structure consistent
    const base = makeNewPlayer(
      this.config.name,
      this.config.position,
      this.config.batHand || "R",
      this.config.hair,
      this.config.skin,
      this.config.facial,
      this.config.teamColor
    );

    // override hands + appearance
    base.throwHand = this.config.throwHand;
    base.batHand = this.config.batHand;
    base.handedness = (this.config.position === "P")
      ? (this.config.throwHand || "R")
      : (this.config.batHand || "R");
    base.hairColor = this.config.hairColor;
    base.teamColor = this.config.teamColor;
    base.skin = this.config.skin;
    base.hair = this.config.hair;
    base.facial = this.config.facial;

    // apply custom stats (we keep unused half at defaults)
    Object.keys(this.stats).forEach(k => {
      base[k] = clampAttr(this.stats[k]);
    });

    // recompute overall based on position
    base.overall = computeOverall(base);

    // save into the correct slot — each slot is its own game
    let slots;
    try {
      const arr = JSON.parse(localStorage.getItem("players") || "[]");
      slots = [arr[0] || null, arr[1] || null, arr[2] || null];
    } catch (e) {
      slots = [null, null, null];
    }

    slots[this.slotIndex] = base;
    localStorage.setItem("players", JSON.stringify(slots));
    localStorage.setItem("currentPlayer", JSON.stringify(base));

    // start game with this profile
    this.scene.start("DraftScene");
  }
}

/* ---------- DraftScene ---------- */
class DraftScene extends Phaser.Scene {
  constructor() {
    super({ key: "DraftScene" });
    this.draftState = null;
    this.roundContainer = null;
    this.generator = null;
  }

  create() {
    this.generator = new PixelPlayerGenerator(this);

    try {
      this.currentPlayer = JSON.parse(localStorage.getItem("currentPlayer") || "null");
    } catch (e) {
      this.currentPlayer = null;
    }

    if (!this.currentPlayer) {
      this.scene.start("ProfileScene");
      return;
    }

    this.buildDraftState();
    this.renderRound();
  }

  buildDraftState() {
    // full roster template (13 spots)
    const fullPositions = ["P", "P", "P", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];

    const positions = fullPositions.slice();
    // remove one instance of created player's position
    const idx = positions.indexOf(this.currentPlayer.position);
    if (idx !== -1) positions.splice(idx, 1);

    // Now 12 positions remain
    shuffleArray(positions);

    // rarity pool: 1 diamond, 1 gold, 2 silver, 2 bronze, 6 common
    const rarities = [
      "diamond",
      "gold",
      "silver", "silver",
      "bronze", "bronze",
      "common", "common", "common", "common", "common", "common"
    ];
    shuffleArray(rarities);

    this.draftState = {
      positions: positions,  // length 12
      rarities: rarities,    // length 12
      round: 0,
      roster: [this.currentPlayer] // created player already on roster
    };
  }

  clearRound() {
    if (this.roundContainer) {
      this.roundContainer.destroy();
      this.roundContainer = null;
    }
  }

  renderRound() {
    this.clearRound();

    const ds = this.draftState;
    const totalRounds = ds.positions.length;

    if (ds.round >= totalRounds) {
      this.finishDraft();
      return;
    }

    const pos = ds.positions[ds.round];
    const rarity = ds.rarities[ds.round];

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.roundContainer = this.add.container(0, 0);

   const bg = this.add.rectangle(0, 0, w * 2, h * 2, 0x0b2430).setOrigin(0);
this.roundContainer.add(bg);


    const header = this.add.text(w / 2, 40,
      `Draft Round ${ds.round + 1} / ${totalRounds}`,
      { font: "24px monospace", fill: "#ffffff" }
    ).setOrigin(0.5);
    this.roundContainer.add(header);

    const subheader = this.add.text(w / 2, 80,
      `Position: ${pos}    Rarity: ${rarity.toUpperCase()}`,
      { font: "18px monospace", fill: "#d0f0ff" }
    ).setOrigin(0.5);
    this.roundContainer.add(subheader);

    // Generate 3 candidates (matching created player's team color)
const teamColor = this.currentPlayer.teamColor;

this.currentOptions = [
  generateRandomDraftPlayer(pos, rarity, teamColor),
  generateRandomDraftPlayer(pos, rarity, teamColor),
  generateRandomDraftPlayer(pos, rarity, teamColor)
];


    const startX = 80;
    const startY = 140;
    const cardW = 280;
    const cardH = 320;
    const gapX = 320;

    this.currentOptions.forEach((p, i) => {
      const x = startX + i * gapX;
      const y = startY;

      const panel = this.add.rectangle(x, y, cardW, cardH, 0x000000, 0.8)
        .setOrigin(0)
        .setStrokeStyle(2, 0xffffff);
      this.roundContainer.add(panel);

      // sprite
      const key = this.generator.generateCharacterTexture(p);
      const animKeys = this.generator.makeAnimationKeysFor(key);
      const sprite = this.add.sprite(x + cardW / 2, y + 90, key).setOrigin(0.5).setScale(2.5);
      sprite.play(animKeys.idle);
      this.roundContainer.add(sprite);

      const nameText = this.add.text(x + 10, y + 10,
        `${p.name} (${p.position})`,
        { font: "14px monospace", fill: "#ffffff" }
      );
      this.roundContainer.add(nameText);

      const ovrText = this.add.text(x + 10, y + 30,
        `OVR: ${p.overall}   ${p.rarity.toUpperCase()}`,
        { font: "14px monospace", fill: "#ffffaa" }
      );
      this.roundContainer.add(ovrText);

      if (isPitcherPosition(p.position)) {
        const lines = [
          `VEL: ${p.velocity}`,
          `MOV: ${p.movement}`,
          `CTL: ${p.control}`,
          `STA: ${p.stamina}`
        ];
        lines.forEach((ln, idx) => {
          const t = this.add.text(x + 10, y + 140 + idx * 18, ln, {
            font: "14px monospace",
            fill: "#d0f0ff"
          });
          this.roundContainer.add(t);
        });
      } else {
        const lines = [
          `CON: ${p.contact}`,
          `POW: ${p.power}`,
          `EYE: ${p.eye}`,
          `SPD: ${p.speed}`,
          `FLD: ${p.fielding}`
        ];
        lines.forEach((ln, idx) => {
          const t = this.add.text(x + 10, y + 140 + idx * 18, ln, {
            font: "14px monospace",
            fill: "#d0f0ff"
          });
          this.roundContainer.add(t);
        });
      }

      const pickBtn = this.add.text(x + cardW / 2, y + cardH - 30, "Select", {
        font: "16px monospace",
        fill: "#00ff00",
        backgroundColor: "#111111",
        padding: { x: 6, y: 4 }
      }).setOrigin(0.5).setInteractive();

      pickBtn.on("pointerdown", () => {
        this.pickPlayer(p);
      });

      this.roundContainer.add(pickBtn);
    });

    // small roster count
    const rosterText = this.add.text(w - 260, h - 40,
      `Roster size: ${ds.roster.length} / 13`,
      { font: "16px monospace", fill: "#ffffff" }
    ).setScrollFactor(0);
    this.roundContainer.add(rosterText);
  }

  pickPlayer(player) {
    this.draftState.roster.push(player);
    this.draftState.round++;
    this.renderRound();
  }

  finishDraft() {
  // 13 players including created player
  const rosterJson = JSON.stringify(this.draftState.roster);
  const rosterKey = "roster_" + this.currentPlayer.id;

  // save roster both under player-specific key and as the currently active roster
  localStorage.setItem(rosterKey, rosterJson);
  localStorage.setItem("currentRoster", rosterJson);

  // go to the main hub instead of straight into a half-broken game scene
  this.scene.start("MainMenuScene");
}

}

/* ---------- MainMenuScene (Team Hub) ---------- */
class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MainMenuScene" });
    this.roster = null;
    this.pitchers = [];
    this.assignedPitcherId = null;
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

    // load roster (prefer currentRoster, fall back to player-specific key)
    const rosterKey = "roster_" + this.currentPlayer.id;
    let rosterJson = localStorage.getItem("currentRoster");
    if (!rosterJson) {
      rosterJson = localStorage.getItem(rosterKey);
    }

    if (!rosterJson) {
      // no roster? send them to draft
      this.scene.start("DraftScene");
      return;
    }

    try {
      this.roster = JSON.parse(rosterJson);
    } catch (e) {
      this.roster = null;
    }

    if (!Array.isArray(this.roster) || this.roster.length === 0) {
      this.scene.start("DraftScene");
      return;
    }

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // background
    this.add.rectangle(0, 0, w * 2, h * 2, 0x061421).setOrigin(0);

    this.add.text(w / 2, 40, "TEAM HUB", {
      font: "28px monospace",
      fill: "#ffffff"
    }).setOrigin(0.5);

    this.add.text(w / 2, 80,
      `${this.currentPlayer.name}  |  POS: ${this.currentPlayer.position}  |  OVR: ${this.currentPlayer.overall}`,
      { font: "16px monospace", fill: "#d0f0ff" }
    ).setOrigin(0.5);

    // split pitchers / hitters
    this.pitchers = this.roster.filter(p => p.position === "P");
    const hitters = this.roster.filter(p => p.position !== "P");

    this.add.text(40, 120, "Pitchers:", {
      font: "18px monospace",
      fill: "#ffffff"
    });

    let y = 150;
    this.pitchers.forEach((p, idx) => {
      const t = this.add.text(60, y,
        `${p.name}  OVR: ${p.overall}  (${p.rarity})`,
        { font: "14px monospace", fill: "#ffffaa", backgroundColor: "#111111", padding: { x: 4, y: 2 } }
      ).setInteractive();

      t.on("pointerdown", () => {
        this.assignStarter(p);
      });

      y += 26;
    });

    this.add.text(480, 120, "Hitters:", {
      font: "18px monospace",
      fill: "#ffffff"
    });

    let hy = 150;
    hitters.forEach(p => {
      this.add.text(500, hy,
        `${p.position}  ${p.name}  OVR: ${p.overall}`,
        { font: "14px monospace", fill: "#d0f0ff" }
      );
      hy += 20;
    });

    // show current assigned starter (if any)
    const starterKey = "assignedPitcher_" + this.currentPlayer.id;
    this.assignedPitcherId = localStorage.getItem(starterKey) || null;
    this.assignedText = this.add.text(40, h - 140, "", {
      font: "16px monospace",
      fill: "#80ff80"
    });
    this.updateAssignedText();

    // Start Game button
    const startBtn = this.add.text(40, h - 80, "Start Game", {
      font: "20px monospace",
      fill: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 8, y: 6 }
    }).setInteractive();

    startBtn.on("pointerdown", () => {
      if (!this.assignedPitcherId) {
        alert("Select a starting pitcher first from the list.");
        return;
      }
      localStorage.setItem("currentRoster", JSON.stringify(this.roster));
      this.scene.start("GameScene");
    });

    // back to profiles
    const backBtn = this.add.text(w - 160, h - 80, "Profiles", {
      font: "16px monospace",
      fill: "#ff8080",
      backgroundColor: "#000000",
      padding: { x: 8, y: 6 }
    }).setInteractive();

    backBtn.on("pointerdown", () => {
      this.scene.start("ProfileScene");
    });
  }

  assignStarter(p) {
    const key = "assignedPitcher_" + this.currentPlayer.id;
    this.assignedPitcherId = p.id;
    localStorage.setItem(key, p.id);
    this.updateAssignedText();
  }

  updateAssignedText() {
    if (!this.assignedText) return;

    if (!this.assignedPitcherId) {
      this.assignedText.setText("Current Game Starter: NONE SELECTED");
      this.assignedText.setStyle({ fill: "#ff8080" });
      return;
    }

    const starter = this.pitchers.find(p => p.id === this.assignedPitcherId);
    if (!starter) {
      this.assignedText.setText("Current Game Starter: INVALID");
      this.assignedText.setStyle({ fill: "#ff8080" });
      return;
    }

    this.assignedText.setText(
      `Current Game Starter: ${starter.name}  (OVR ${starter.overall})`
    );
    this.assignedText.setStyle({ fill: "#80ff80" });
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

    // NEW: load roster
    let rosterJson = localStorage.getItem("currentRoster");
    if (!rosterJson && this.currentPlayer) {
      const rosterKey = "roster_" + this.currentPlayer.id;
      rosterJson = localStorage.getItem(rosterKey);
    }

    if (!rosterJson) {
      this.scene.start("MainMenuScene");
      return;
    }

    try {
      this.roster = JSON.parse(rosterJson);
    } catch (e) {
      this.roster = null;
    }

    if (!Array.isArray(this.roster) || this.roster.length === 0) {
      this.scene.start("MainMenuScene");
      return;
    }

    // figure out which pitcher is assigned as starter
    const starterKey = "assignedPitcher_" + this.currentPlayer.id;
    const starterId = localStorage.getItem(starterKey);
    let starter = starterId
      ? this.roster.find(p => p.id === starterId)
      : null;

    if (!starter) {
      // fallback: any pitcher, or created player
      starter = this.roster.find(p => p.position === "P") || this.currentPlayer;
    }

    // create gameState, background, etc...


    this.gameState = {
      inning: 1,
      half: "top",
      outs: 0,
      score: { visiting: 0, home: 0 },
      teamPlayers: []
    };

     const bg = this.add.rectangle(0, 0, 280, 200, 0x000000, 0.65).setOrigin(0);
     this.bases = this.getBasesLayout();

     this.generator = this.generator || new PixelPlayerGenerator(this);
     this.defenders = [];
     this.runners = []; 

    // Add the baseball field background (pixel art)
const field = this.add.image(0, 0, "field")
    .setOrigin(0)
    .setScale(1);

// Set camera bounds so the field is the world
this.cameras.main.setBounds(0, 0, field.width, field.height);


       // Build a lookup of fielders by position from the roster
    const fielderPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    const fielderMap = {};
    fielderPositions.forEach(pos => {
      const found = this.roster.find(p => p.position === pos);
      if (found) fielderMap[pos] = found;
    });

    this.defenders = [];

    fielderPositions.forEach(pos => {
      const basePlayer = fielderMap[pos];
      if (!basePlayer) return; // should exist from draft, but just in case

      const clone = JSON.parse(JSON.stringify(basePlayer));
      clone.id = clone.id + "_def";
      clone.role = "fielder";

      const coords = this.getFielderCoords(pos);
      const obj = this.createPlayerSprite(coords.x, coords.y, clone);

      this.defenders.push(obj);
      this.gameState.teamPlayers.push(clone);
    });


       const pClone = JSON.parse(JSON.stringify(starter));
    pClone.id = pClone.id + "_pitch";
    pClone.position = "P";
    pClone.role = "pitcher";

    // mound position (we’ll later sync this with the exact mound spot from the art)
    const moundX = GAME_WIDTH / 2;
    const moundY = GAME_HEIGHT / 2 - 60;

    this.pitcherObj = this.createPlayerSprite(moundX, moundY, pClone);
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
    return [
        // Outfield (deep & correct positions)
        { x: 512, y: 180 },  // CF
        { x: 260, y: 220 },  // LF
        { x: 760, y: 220 },  // RF

        // Infield baseline (perfectly matching stadium)
        { x: 315, y: 355 },  // 3B
        { x: 710, y: 355 },  // 1B
        { x: 420, y: 390 },  // SS
        { x: 610, y: 390 },  // 2B

        // Battery (home side)
        { x: 512, y: 470 },  // C

        // Temporary extra fielder (later replaced by real positions)
        { x: 512, y: 330 }   // Spare infielder
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

     getFielderCoords(pos) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 40;
    const bases = this.bases || this.getBasesLayout();

    // These can be tweaked later to match the final art, but they’re roughly:
    // infielders around the bases, outfielders deeper, catcher behind home.
    const layout = {
      C:  { x: bases.home.x,        y: bases.home.y + 28 },
      "1B": { x: bases.first.x + 30,  y: bases.first.y + 10 },
      "2B": { x: bases.second.x + 10, y: bases.second.y - 30 },
      "3B": { x: bases.third.x - 30,  y: bases.third.y + 10 },
      SS: { x: bases.second.x - 70, y: bases.second.y + 20 },

      LF: { x: bases.third.x - 90,  y: bases.third.y - 140 },
      CF: { x: cx,                  y: cy - 160 },
      RF: { x: bases.first.x + 90,  y: bases.first.y - 140 }
    };

    return layout[pos] || { x: cx, y: cy };
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
     scene: [BootScene, TitleScene, ProfileScene, CreatePlayerScene, DraftScene, MainMenuScene, GameScene, ShopScene]

};

const game = new Phaser.Game(config);
