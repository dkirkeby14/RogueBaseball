
// Combined prototype game.js (Phaser 3) - simplified but functional
const W = 1024, H = 640;
const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-container',
  backgroundColor: '#4aa34a',
  pixelArt: true,
  scene: [BootScene, TitleScene, ProfileScene, MainScene, ShopScene],
  physics: { default: 'arcade', arcade: { debug: false } }
};
const game = new Phaser.Game(config);

/* BootScene */
class BootScene extends Phaser.Scene { constructor(){ super({ key:'BootScene'});} preload(){} create(){ this.scene.start('TitleScene'); } }

/* TitleScene */
class TitleScene extends Phaser.Scene { constructor(){ super({ key:'TitleScene'});} create(){
  const w=this.cameras.main.width, h=this.cameras.main.height;
  this.add.rectangle(0,0,w*2,h*2,0x0b2a3a).setOrigin(0);
  this.add.text(w/2, h/3, 'RETRO BASEBALL ROGUELIKE', { font:'36px monospace', fill:'#fff' }).setOrigin(0.5);
  this.add.text(w/2, h/3 + 70, 'Tap / Click to Start', { font:'18px monospace', fill:'#d8f0ff' }).setOrigin(0.5);
  this.input.once('pointerdown', ()=> this.scene.start('ProfileScene'));
}}

/* ProfileScene */
class ProfileScene extends Phaser.Scene { constructor(){ super({ key:'ProfileScene'});} create(){
  const w=this.cameras.main.width;
  this.add.rectangle(0,0,w*2,H*2,0x0b2430).setOrigin(0);
  this.add.text(w/2,40,'Select or Create Player',{font:'24px monospace', fill:'#fff'}).setOrigin(0.5);
  this.loadPlayers(); this.renderList(); this.createDOM();
}
loadPlayers(){ this.players = JSON.parse(localStorage.getItem('players')||'[]'); }
renderList(){
  if(this.playerTexts) this.playerTexts.forEach(t=>t.destroy&&t.destroy()); this.playerTexts=[];
  const startY=110, gap=46;
  if(this.players.length===0){ this.add.text(W/2, startY, 'No players yet. Create one below.', { font:'18px monospace' }).setOrigin(0.5); }
  else { this.players.forEach((p,idx)=>{
    const label = `${p.name} (Lvl ${p.level||1})`;
    const t = this.add.text(120, startY + idx*gap, label, { font:'18px monospace', fill:'#fff', backgroundColor:'#000', padding:{x:6,y:6} })
      .setInteractive().on('pointerdown', ()=>{ localStorage.setItem('currentPlayer', JSON.stringify(p)); this.scene.start('MainScene'); });
    this.playerTexts.push(t);
  }); }
}
createDOM(){
  const existing = document.getElementById('profile-ui'); if(existing) existing.remove();
  const div = document.createElement('div'); div.id='profile-ui'; div.className='shop-ui';
  div.innerHTML = `<div style="color:#fff; font-family:monospace;">
    <div style="margin-bottom:6px;">Name: <input id="pname" value="Player" /></div>
    <div style="margin-bottom:6px;">Handed: <select id="phand"><option>R</option><option>L</option></select></div>
    <div style="margin-bottom:6px;">Hair: <select id="phair"><option>short</option><option>long</option><option>mohawk</option><option>bald</option></select></div>
    <div style="margin-bottom:6px;">Skin: <input id="pskin" type="color" value="#f1c27d" /></div>
    <div style="margin-bottom:6px;">Team Color: <input id="pteam" type="color" value="#2a6dd6" /></div>
    <div><button id="createPlayerBtn" class="small-btn">Create Player</button><button id="deleteAllBtn" class="small-btn">Delete All</button></div>
  </div>`;
  document.body.appendChild(div);
  document.getElementById('createPlayerBtn').onclick = ()=> {
    const name = document.getElementById('pname').value || 'Player';
    const handed = document.getElementById('phand').value; const hair = document.getElementById('phair').value;
    const skin = document.getElementById('pskin').value; const teamColor = document.getElementById('pteam').value;
    const player = makeNewPlayer(name, 'P', handed, hair, skin, '#000', teamColor);
    this.players.push(player); localStorage.setItem('players', JSON.stringify(this.players));
    localStorage.setItem('currentPlayer', JSON.stringify(player)); location.reload();
  };
  document.getElementById('deleteAllBtn').onclick = ()=> { if(confirm('Delete ALL players?')){ localStorage.removeItem('players'); localStorage.removeItem('currentPlayer'); location.reload(); } };
}
}

/* Player helpers (simple) */
const RARITIES = ['common','bronze','silver','gold','diamond','blackDiamond'];
function makeNewPlayer(name='Player', position='P', handedness='R', hair='short', skin='#f1c27d', facial='none', teamColor='#2a6dd6'){
  const base=(min,max)=> Math.floor(Math.random()*(max-min)+min);
  const p = { id:'pl_'+Date.now()+'_'+Math.floor(Math.random()*9999), name, position, handedness, hair, skin, facial, teamColor, rarity:'common', level:1, xp:0, xpToNextLevel:10, currency:50, perksApplied:{}, perksOwned:[], velocity: base(55,75), movement: base(50,70), control: base(50,70), stamina: base(70,95), contact: base(45,70), power: base(40,70), eye: base(45,70), speed: base(45,70), fielding: base(45,70), pitches:{ fastball: base(60,85), curveball: base(50,75), slider: base(50,75), changeup: base(50,75) } };
  ['velocity','movement','control','stamina','contact','power','eye','speed','fielding'].forEach(k=>{ p.perksApplied[k]=p.perksApplied[k]||0; });
  return p;
}
function getEffectiveAttribute(player, attr){ const base = player[attr]||0; const boost = (player.perksApplied && (player.perksApplied[attr]||0))||0; return Math.min(99, base + boost); }

/* PixelPlayerGenerator (procedural pixels) */
class PixelPlayerGenerator {
  constructor(scene){ this.scene = scene; this.baseW=16; this.baseH=24; this.scale=3; this.animFrames={ idle:2, walk:4, run:4, pitch:3, swing:3, catch:3 }; this.registered=new Set(); }
  keyFor(cfg){ return `c_${cfg.id||cfg.name}_${cfg.position}_${cfg.handedness}_${cfg.skin}_${cfg.hair}_${cfg.facial}_${cfg.teamColor}`; }
  makeAnimationKeysFor(key){ return { idle:`${key}_idle`, walk:`${key}_walk`, run:`${key}_run`, pitch:`${key}_pitch`, swing:`${key}_swing`, catch:`${key}_catch` }; }
  generateCharacterTexture(cfg){
    const key=this.keyFor(cfg); if(this.registered.has(key)) return key;
    const actionOrder=['idle','walk','run','pitch','swing','catch']; const cols=Math.max(...Object.values(this.animFrames)); const rows=actionOrder.length;
    const cw=this.baseW*cols, ch=this.baseH*rows; const canvas=document.createElement('canvas'); canvas.width=cw; canvas.height=ch; const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    for(let r=0;r<rows;r++){ const action=actionOrder[r]; const frames=this.animFrames[action]; for(let f=0; f<frames; f++){ const px=f*this.baseW, py=r*this.baseH; drawPlayerFrame(ctx, px, py, this.baseW, this.baseH, f, action, cfg); } for(let f=this.animFrames[action]; f<cols; f++){ const sx=(this.animFrames[action]-1)*this.baseW, sy=r*this.baseH; ctx.drawImage(canvas, sx, sy, this.baseW, this.baseH, f*this.baseW, sy, this.baseW, this.baseH); } }
    const totalFrames = cols*rows;
    for(let i=0;i<totalFrames;i++){ const sx=(i%cols)*this.baseW; const sy=Math.floor(i/cols)*this.baseH; const small=document.createElement('canvas'); small.width=this.baseW; small.height=this.baseH; const sctx=small.getContext('2d'); sctx.imageSmoothingEnabled=false; sctx.drawImage(canvas, sx, sy, this.baseW, this.baseH, 0,0,this.baseW,this.baseH); const smallKey=`${key}_f${i}`; this.scene.textures.addBase64(smallKey, small.toDataURL()); }
    let idx=0; const framesMap={};
    for(let r=0;r<rows;r++){ const action=actionOrder[r]; framesMap[action]=[]; for(let c=0;c<cols;c++){ framesMap[action].push({ key: `${key}_f${idx}` }); idx++; } }
    const anims=this.scene.anims; const make=(action,fps,repeat)=>{ const animKey=this.makeAnimationKeysFor(key)[action]; if(!anims.exists(animKey)){ anims.create({ key:animKey, frames:framesMap[action], frameRate:fps, repeat }); } };
    make('idle',6,-1); make('walk',10,-1); make('run',12,-1); make('pitch',10,0); make('swing',12,0); make('catch',10,0);
    this.registered.add(key); return key;
  }
}

function drawPlayerFrame(ctx, px, py, w, h, fIndex, action, cfg){
  const skin = cfg.skin || '#f1c27d'; const hairColor = cfg.hairColor || cfg.hair || '#222222'; const team = cfg.teamColor || '#2a6dd6';
  const hairStyle = cfg.hair || 'short'; const facial = cfg.facial || 'none'; ctx.clearRect(px,py,w,h);
  const cx = px + Math.floor(w/2); let offsetY=0, armOffset=0;
  if(action==='idle') offsetY = (fIndex%2)?0:1;
  if(action==='walk') { offsetY = (fIndex%2)?0:1; armOffset = (fIndex%4)-1; }
  if(action==='run') { offsetY = (fIndex%2)?0:1; armOffset = (fIndex%2)?-1:1; }
  if(action==='pitch') { armOffset = (fIndex===0)?-2:(fIndex===1)?0:2; offsetY = (fIndex===1)?-1:0; }
  if(action==='swing') { armOffset = (fIndex===0)?-2:(fIndex===1)?1:3; offsetY = (fIndex%2)?0:1; }
  if(action==='catch') { armOffset = (fIndex%3)-1; }
  const torsoW=6, torsoH=7; const torsoX=cx-Math.floor(torsoW/2), torsoY = py+8+offsetY;
  ctx.fillStyle = team; ctx.fillRect(torsoX, torsoY, torsoW, torsoH);
  ctx.fillStyle = '#333'; ctx.fillRect(cx-3, torsoY+torsoH, 3,5); ctx.fillRect(cx, torsoY+torsoH, 3,5);
  const headX = cx-2, headY = torsoY-6+offsetY; ctx.fillStyle = skin; ctx.fillRect(headX, headY, 5,5);
  ctx.fillStyle = hairColor;
  if(hairStyle==='short') ctx.fillRect(headX, headY, 5,2);
  else if(hairStyle==='long') ctx.fillRect(headX-1, headY+1, 7,4);
  else if(hairStyle==='mohawk') ctx.fillRect(cx-1, headY-1, 1,5);
  ctx.fillStyle = '#222';
  if(facial==='mustache') ctx.fillRect(cx-1, headY+1, 3,1);
  if(facial==='beard') ctx.fillRect(headX, headY+3, 5,2);
  if(facial==='goatee') ctx.fillRect(cx-1, headY+3, 3,1);
  ctx.fillStyle = '#111'; ctx.fillRect(cx-1, headY+1, 1,1); ctx.fillRect(cx+1, headY+1, 1,1);
  if(cfg.role==='batter' || cfg.position!=='P'){ const batX = (cfg.handedness==='R') ? cx+3+armOffset : cx-9+armOffset; ctx.fillStyle='#7a5c2b'; ctx.fillRect(batX, torsoY+1, 1,6); }
  else if(cfg.position==='P' || cfg.role==='pitcher'){ ctx.fillStyle='#5a3a1a'; ctx.fillRect(cx-7, torsoY+1, 3,3); const handSide=(cfg.handedness==='R')?1:-1; ctx.fillStyle='#fff'; ctx.fillRect(cx + (handSide*(3 + Math.max(0, armOffset))), torsoY - 1, 1,1); }
  ctx.strokeStyle = '#000'; ctx.lineWidth = 0.5; ctx.strokeRect(px+0.5,py+0.5,w-1,h-1);
}

/* MainScene (simplified demo) */
class MainScene extends Phaser.Scene {
  constructor(){ super({ key:'MainScene' }); }
  init(){ this.generator = new PixelPlayerGenerator(this); }
  create(){
    this.currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
    if(!this.currentPlayer){ this.scene.start('ProfileScene'); return; }
    this.gameState = { inning:1, half:'top', outs:0, score:{ visiting:0, home:0 }, teamPlayers:[] };
    this.defenders = []; const defenderPositions = this.calculateDefenderPositions();
    for(let i=0;i<9;i++){
      const clone = JSON.parse(JSON.stringify(this.currentPlayer)); clone.id = clone.id + '_tm_' + i;
      clone.contact = Math.max(40, Math.min(99, clone.contact + Phaser.Math.Between(-6,6)));
      clone.power = Math.max(40, Math.min(99, clone.power + Phaser.Math.Between(-6,6)));
      clone.position = 'F'; clone.role = 'fielder';
      const obj = this.createPlayerSprite(defenderPositions[i].x, defenderPositions[i].y, clone); this.defenders.push(obj); this.gameState.teamPlayers.push(clone);
    }
    const pClone = JSON.parse(JSON.stringify(this.currentPlayer)); pClone.id = pClone.id + '_pitch'; pClone.position='P'; pClone.role='pitcher';
    this.pitcher = this.createPlayerSprite(W/2, H/2 - 40, pClone); this.gameState.teamPlayers.push(pClone);
    const bClone = JSON.parse(JSON.stringify(this.currentPlayer)); bClone.id = bClone.id + '_batt'; bClone.position='B'; bClone.role='batter';
    this.batter = this.createPlayerSprite(W/2, H - 120, bClone);
    this.ball = this.add.circle(-50,-50,4,0xffffff).setVisible(false); this.physics.add.existing(this.ball); this.ball.body.setCircle(4);
    this.cameras.main.setBounds(0,0,W*1.5,H*1.5); this.cameras.main.startFollow(this.batter.sprite, true, 0.08,0.08); this.cameras.main.setZoom(1.0);
    this.createScorebug(); this.createScoreLabel(); this.createShopButton();
    this.input.keyboard.on('keydown-SPACE', ()=> this.triggerAtBatDemo());
    this.currentCatcher = null; this.runners = []; this.bases = this.createBasePositions();
    this.cardContainer = this.add.container(10, H - 220); this.redrawPlayerCard(this.currentPlayer, this.cardContainer);
    this.scene.launch('ShopScene'); this.scene.pause('ShopScene');
  }
  calculateDefenderPositions(){ const cx=W/2, cy=H/2 - 60; return [ {x: cx, y: cy - 120}, {x: cx - 160, y: cy - 40}, {x: cx + 160, y: cy - 40}, {x: cx - 80, y: cy + 20}, {x: cx + 80, y: cy + 20}, {x: cx - 30, y: cy + 100}, {x: cx + 30, y: cy + 100}, {x: cx - 220, y: cy - 120}, {x: cx + 220, y: cy - 120} ]; }
  createBasePositions(){ const cx=W/2, cy=H/2 + 20; return { home:{ x: W/2, y: H - 110 }, 1:{ x: cx + 140, y: cy + 80 }, 2:{ x: cx, y: cy - 120 }, 3:{ x: cx - 140, y: cy + 80 } }; }
  createPlayerSprite(x,y,cfg){ cfg = Object.assign({}, cfg); const key = this.generator.generateCharacterTexture(cfg); const sprite = this.add.sprite(x,y,key).setOrigin(0.5,0.9); sprite.setScale(this.generator.scale); this.physics.add.existing(sprite); sprite.body.setCircle(12).setOffset(-12,-24); sprite.play(this.generator.makeAnimationKeysFor(key).idle); return { sprite, cfg, key }; }
  createScorebug(){ this.scorebug = this.add.text(10,10,'',{ font:'14px monospace', fill:'#fff', backgroundColor:'#000', padding:{x:6,y:6} }).setScrollFactor(0).setDepth(10); this.updateScorebug(); }
  createScoreLabel(){ this.scoreLabel = this.add.text(W/2 - 200, 10, '', { font:'16px monospace', fill:'#fff', backgroundColor:'#000', padding:{x:6,y:6} }).setScrollFactor(0).setDepth(10); this.updateScoreLabel(); }
  createShopButton(){ const btn = this.add.text(W - 140, 10, 'Shop', { font:'16px monospace', fill:'#0ff', backgroundColor:'#000', padding:{x:6,y:6} }).setScrollFactor(0).setDepth(10).setInteractive(); btn.on('pointerdown', ()=> { this.scene.pause(); this.scene.launch('ShopScene', { parentScene: this.scene.key }); const shop = this.scene.get('ShopScene'); shop.onClose = ()=> { this.scene.resume(); this.redrawPlayerCard(this.currentPlayer, this.cardContainer); this.updateScorebug(); }; shop.currentPlayer = this.currentPlayer; }); }
  updateScorebug(){ const gs=this.gameState; this.scorebug.setText(`Inning: ${gs.inning} (${gs.half})\\nOuts: ${gs.outs}\\nScore: V ${gs.score.visiting} - H ${gs.score.home}`); }
  updateScoreLabel(){ this.scoreLabel.setText(`Player: ${this.currentPlayer.name}  Coins: ${this.currentPlayer.currency}`); }

  triggerAtBatDemo(){ const pitcherAnim = this.generator.makeAnimationKeysFor(this.pitcher.key); const batterAnim = this.generator.makeAnimationKeysFor(this.batter.key); this.pitcher.sprite.play(pitcherAnim.pitch); this.time.delayedCall(600, ()=>{ this.batter.sprite.play(batterAnim.swing); const resolve = resolveAtBat(this.pitcher.cfg, this.batter.cfg, { strikes:0, balls:0 }, 0); const start = { x: this.pitcher.sprite.x, y: this.pitcher.sprite.y - 10 }; const mid = { x: this.batter.sprite.x + Phaser.Math.Between(-20,20), y: this.batter.sprite.y - 10 }; this.ball.setPosition(start.x, start.y).setVisible(true); this.ball.body.reset(start.x,start.y); const vx=(mid.x-start.x)/0.35, vy=(mid.y-start.y)/0.35; this.ball.body.setVelocity(vx,vy); this.cameras.main.startFollow(this.ball, true, 0.12, 0.12); this.cameras.main.zoomTo(1.2, 300); this.time.delayedCall(500, ()=>{ const r=resolve.outcome; if(r === 'walk') { this.currentPlayer.currency += 2; localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer)); this.showCoinFeedback(2, this.scorebug.x+80, this.scorebug.y+20); this.resetAfterPlay(); } else if(r === 'strike' || r === 'strikeout') { this.gameState.outs++; this.updateScorebug(); this.resetAfterPlay(); } else if(r === 'bunt' || r === 'buntFail') { if(r==='buntFail'){ this.gameState.outs++; this.updateScorebug(); } else { this.advanceRunnersSimple('single'); } this.resetAfterPlay(); } else if(r === 'single' || r === 'extraBaseHit' || r === 'hit' || r==='weakContact') { const outX = this.ball.x + Phaser.Math.Between(-200,300); const outY = this.ball.y - Phaser.Math.Between(120,320); this.tweens.add({ targets:this.ball, x:outX, y:outY, duration:800, ease:'Power2', onComplete:()=>{ let closest = this.defenders[0], md = Phaser.Math.Distance.Between(outX,outY,this.defenders[0].sprite.x,this.defenders[0].sprite.y); for(const f of this.defenders){ const d=Phaser.Math.Distance.Between(outX,outY,f.sprite.x,f.sprite.y); if(d<md){ md=d; closest=f; } } this.currentCatcher = closest; } }); } else { this.resetAfterPlay(); } }); }); }

  moveFielderToBall(fielder, ball, speed=120){ const dx = ball.x - fielder.sprite.x, dy = ball.y - fielder.sprite.y; const dist = Math.sqrt(dx*dx+dy*dy); if(dist < 12){ fielder.sprite.play(this.generator.makeAnimationKeysFor(fielder.key).catch); this.ball.setVisible(false); this.ball.body.reset(-50,-50); this.cameras.main.startFollow(fielder.sprite, true, 0.12, 0.12); this.time.delayedCall(600, ()=> { this.resetAfterPlay(); this.currentCatcher=null; }); return; } const vx = (dx/dist)*speed, vy = (dy/dist)*speed; fielder.sprite.x += vx * this.game.loop.delta/1000; fielder.sprite.y += vy * this.game.loop.delta/1000; fielder.sprite.play(this.generator.makeAnimationKeysFor(fielder.key).run, true); }

  advanceRunnersSimple(type='single'){ const runnerCfg = JSON.parse(JSON.stringify(this.currentPlayer)); runnerCfg.position='R'; const runner = this.createPlayerSprite(this.batter.sprite.x, this.batter.sprite.y, runnerCfg); runner.currentBase='home'; runner.targetBase=1; runner.reached=false; this.runners.push(runner); this.currentPlayer.currency += (type==='extraBaseHit')?8:3; localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer)); this.showCoinFeedback((type==='extraBaseHit')?8:3, this.scorebug.x+80, this.scorebug.y+20); this.updateScoreLabel(); }

  resetAfterPlay(){ this.ball.setVisible(false); this.ball.body.reset(-50,-50); this.cameras.main.startFollow(this.batter.sprite, true, 0.08, 0.08); this.cameras.main.zoomTo(1.0, 300); for(const p of [...this.defenders, this.pitcher, this.batter]) p.sprite.play(this.generator.makeAnimationKeysFor(p.key).idle); if(this.gameState.outs >= 3){ this.endHalfInning(); } }

  endHalfInning(){ this.showFullScoreboard(); this.gameState.outs = 0; this.gameState.runners = []; this.time.delayedCall(1200, ()=> { this.scene.pause(); this.scene.launch('ShopScene', { parentScene: this.scene.key }); const shop = this.scene.get('ShopScene'); shop.currentPlayer = this.currentPlayer; shop.onClose = ()=>{ this.scene.resume(); this.redrawPlayerCard(this.currentPlayer, this.cardContainer); }; }); }

  update(time, delta){ if(this.currentCatcher) this.moveFielderToBall(this.currentCatcher, this.ball); for(const r of this.runners){ if(r.targetBase && !r.reached){ const tpos = this.bases[r.targetBase]; const dx = tpos.x - r.sprite.x, dy = tpos.y - r.sprite.y; const dist=Math.sqrt(dx*dx+dy*dy); if(dist<4){ r.reached=true; } else { const speed = 80 + (getEffectiveAttribute(r.cfg,'speed') - 50); const vx = (dx/dist)*speed, vy=(dy/dist)*speed; r.sprite.x += vx * delta/1000; r.sprite.y += vy * delta/1000; r.sprite.play(this.generator.makeAnimationKeysFor(r.key).run, true); } } } }

  redrawPlayerCard(player, container){ container.removeAll(true); const startX = 10, startY = 10; const bg = this.add.rectangle(startX, startY, 260, 200, 0x000000, 0.65).setOrigin(0); container.add(bg); const key = this.generator.generateCharacterTexture(player); const img = this.add.sprite(startX + 40, startY + 60, key).setOrigin(0.5).setScale(3); img.play(this.generator.makeAnimationKeysFor(key).idle); container.add(img); const nameText = this.add.text(startX + 90, startY + 18, `${player.name}`, { font:'14px monospace', fill:'#fff' }); container.add(nameText); const coinsText = this.add.text(startX + 90, startY + 38, `Coins: ${player.currency}`, { font:'12px monospace', fill:'#ff0' }); container.add(coinsText); const attrs = player.position === 'P' ? ['velocity','movement','control','stamina'] : ['contact','power','eye','speed','fielding']; const barX = startX + 90, barW = 140, barH = 12; for(let i=0;i<attrs.length;i++){ const attr = attrs[i]; const y = startY + 60 + i*28; const base = player[attr] || 0; const boost = player.perksApplied[attr] || 0; const total = Math.min(99, base + boost); const baseW = Math.round((base/99)*barW), boostW = Math.round(((total - base)/99)*barW); const lbl = this.add.text(startX + 10, y - 8, attr.toUpperCase(), { font:'12px monospace', fill:'#fff' }); const baseBar = this.add.rectangle(barX, y, baseW, barH, 0x5555ff).setOrigin(0,0.5); if(boostW>0) this.add.rectangle(barX + baseW, y, boostW, barH, 0xffff00).setOrigin(0,0.5); this.add.text(barX + barW + 6, y - 8, `${total}`, { font:'12px monospace', fill:'#fff' }); container.add([lbl, baseBar]); } }

  showCoinFeedback(amount, x=200, y=80){ const txt = this.add.text(x, y, `${amount>0?'+':''}${amount} coins!`, { font:'16px monospace', fill: amount>0? '#0f0' : '#f00', backgroundColor:'#000', padding:{x:6,y:4} }).setScrollFactor(0).setDepth(60); this.tweens.add({ targets: txt, y: y-40, alpha:0, duration:1500, ease:'Power1', onComplete: ()=> txt.destroy() }); this.updateScoreLabel(); }

  showFullScoreboard(){ const gs=this.gameState; const bg = this.add.rectangle(W/2, H/2, 600, 300, 0x000000, 0.9).setDepth(50); const title = this.add.text(W/2 - 120, H/2 - 120, 'SCOREBOARD', { font:'20px monospace', fill:'#fff' }).setDepth(51); const lines = [ `Inning: ${gs.inning} (${gs.half})`, `Score: V ${gs.score.visiting} - H ${gs.score.home}`, `Outs: ${gs.outs}` ]; for(let i=0;i<lines.length;i++) this.add.text(W/2 - 120, H/2 - 80 + i*28, lines[i], { font:'16px monospace', fill:'#fff' }).setDepth(51); this.time.delayedCall(1200, ()=> { bg.destroy(); title.destroy(); }); }
}

/* ----------------------------------------------------
   SHOP Scene (simplified)
   ---------------------------------------------------- */
class ShopScene extends Phaser.Scene { constructor(){ super({ key:'ShopScene' }); } init(data){ this.parentScene = data.parentScene || null; } create(){
  this.generator = new PixelPlayerGenerator(this);
  this.currentPlayer = JSON.parse(localStorage.getItem('currentPlayer') || 'null');
  if(!this.currentPlayer){ this.scene.stop(); if(this.parentScene) this.scene.resume(this.parentScene); return; }
  this.add.rectangle(0,0,W*2,H*2,0x0b2430).setOrigin(0);
  this.add.text(20,20,'SHOP', { font:'22px monospace', fill:'#fff' });
  this.shopRound = generateShopRound({ unlockedMaxRarity: this.currentPlayer.unlockedMaxRarity || 'bronze', bossCount: this.currentPlayer.bossCount || 0 });
  this.renderShopRound();
  const close = this.add.text(20, H - 60, 'Back', { font:'16px monospace', fill:'#0ff', backgroundColor:'#000', padding:{x:6,y:6} }).setInteractive();
  close.on('pointerdown', ()=> this.closeShop());
} renderShopRound(){
  if(this.uiGroup) this.uiGroup.destroy(true); this.uiGroup = this.add.container(0,0);
  const startX = 60, startY = 80;
  for(let i=0;i<3;i++){
    const slot = this.shopRound.cardSlots[i]; const x = startX + i*300, y = startY;
    const rect = this.add.rectangle(x, y, 240, 120, 0x000000, 0.7).setOrigin(0).setInteractive();
    const border = this.add.rectangle(x+120, y+60, 236, 116).setStrokeStyle(3, 0xffffff).setOrigin(0.5);
    const title = this.add.text(x+12, y+10, `${slot.card.displayName}`, { font:'14px monospace', fill: '#fff' });
    const price = this.add.text(x+12, y+36, `Price: ${slot.price}`, { font:'12px monospace', fill:'#fff' });
    rect.on('pointerdown', ()=> this.showPreview(slot, 'card'));
    this.uiGroup.add([rect, border, title, price]);
  }
  const packStartX = 180, packStartY = 230;
  for(let j=0;j<2;j++){
    const pack = this.shopRound.packSlots[j]; const x = packStartX + j*420, y = packStartY;
    const rect = this.add.rectangle(x, y, 360, 120, 0x000000, 0.7).setOrigin(0).setInteractive();
    const border = this.add.rectangle(x+180, y+60, 356, 116).setStrokeStyle(3, 0xffffff).setOrigin(0.5);
    const title = this.add.text(x+12, y+10, `${pack.packType.toUpperCase()} PACK (${pack.packRarity})`, { font:'14px monospace', fill: '#fff' });
    const price = this.add.text(x+12, y+36, `Price: ${pack.price}`, { font:'12px monospace', fill:'#fff' });
    rect.on('pointerdown', ()=> this.showPreview(pack, 'pack'));
    this.uiGroup.add([rect, border, title, price]);
  }
  this.previewContainer = this.add.container(W - 360, 60);
  this.renderPlayerPreview(this.currentPlayer, this.previewContainer);
} renderPlayerPreview(player, container){
  container.removeAll(true); const bg = this.add.rectangle(0,0,340,360,0x000000,0.6).setOrigin(0); container.add(bg);
  const key = this.generator.generateCharacterTexture(player);
  const img = this.add.sprite(60,80,key).setScale(4).setOrigin(0.5); img.play(this.generator.makeAnimationKeysFor(key).idle); container.add(img);
  container.add(this.add.text(130,18,player.name, { font:'16px monospace', fill:'#fff' }));
  const attrs = ['velocity','movement','control','stamina','contact','power','eye','speed','fielding'];
  for(let i=0;i<attrs.length;i++){ const a = attrs[i]; const val = player[a] || 0; const boost = player.perksApplied[a] || 0; const total = Math.min(99,val+boost); const y = 120 + i*20; const lbl = this.add.text(10,y, a.toUpperCase(), { font:'12px monospace', fill:'#fff' }); const baseW = Math.round((val/99)*180); const boostW = Math.round(((total-val)/99)*180); const baseBar = this.add.rectangle(110,y+8, baseW, 12, 0x5555ff).setOrigin(0,0.5); if(boostW>0) this.add.rectangle(110+baseW, y+8, boostW, 12, 0xffff00).setOrigin(0,0.5); const num = this.add.text(300, y, `${total}`, { font:'12px monospace', fill:'#fff' }); container.add([lbl, baseBar, num]); }
  container.add(this.add.text(10, 320, `Coins: ${player.currency}`, { font:'14px monospace', fill:'#ff0' }));
}
showPreview(slotObj, slotType){ this.uiGroup.setVisible(false); this.previewPanel = this.add.container(80, 380); const bg = this.add.rectangle(0,0, W-160, 200, 0x000000, 0.85).setOrigin(0); this.previewPanel.add(bg);
  if(slotType==='card'){ const c = slotObj.card; this.previewPanel.add(this.add.text(24,16, `${c.displayName}`, { font:'20px monospace', fill: '#fff' })); this.previewPanel.add(this.add.text(24,56, `Kind: ${c.kind}`, { font:'14px monospace', fill:'#fff' })); this.previewPanel.add(this.add.text(24,80, `Rarity: ${c.rarity}`, { font:'14px monospace', fill:'#fff' })); this.previewPanel.add(this.add.text(24,110, `Price: ${slotObj.price}`, { font:'14px monospace', fill:'#fff' })); const buy = this.add.text(400, 140, 'Buy', { font:'16px monospace', fill:'#0f0', backgroundColor:'#000', padding:{x:6,y:6} }).setInteractive(); buy.on('pointerdown', ()=> { if(this.currentPlayer.currency < slotObj.price) { this.notifyInsufficient(); return; } this.currentPlayer.currency -= slotObj.price; localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer)); this.applyCardToPlayer(slotObj.card); this.previewPanel.destroy(); this.uiGroup.destroy(); this.shopRound = generateShopRound({ unlockedMaxRarity: this.currentPlayer.unlockedMaxRarity || 'bronze', bossCount: this.currentPlayer.bossCount || 0 }); this.renderShopRound(); }); const back = this.add.text(300,140, 'Back', { font:'16px monospace', fill:'#ff0', backgroundColor:'#000', padding:{x:6,y:6} }).setInteractive(); back.on('pointerdown', ()=> { this.previewPanel.destroy(); this.uiGroup.setVisible(true); }); this.previewPanel.add([buy, back]); }
  else if(slotType==='pack'){ const p = slotObj; this.previewPanel.add(this.add.text(24,16, `${p.packType.toUpperCase()} PACK`, { font:'20px monospace', fill: '#fff' })); this.previewPanel.add(this.add.text(24,56, `Pack rarity: ${p.packRarity}`, { font:'14px monospace', fill: '#fff' })); this.previewPanel.add(this.add.text(24,86, `Price: ${p.price}`, { font:'14px monospace', fill:'#fff' })); const buy = this.add.text(420,140, 'Buy', { font:'16px monospace', fill:'#0f0', backgroundColor:'#000', padding:{x:6,y:6} }).setInteractive(); buy.on('pointerdown', ()=> { if(this.currentPlayer.currency < p.price){ this.notifyInsufficient(); return; } this.currentPlayer.currency -= p.price; localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer)); const revealed = openPack(p); this.previewPanel.destroy(); this.showPackReveal(p, revealed); }); const back = this.add.text(320,140,'Back', { font:'16px monospace', fill:'#ff0', backgroundColor:'#000', padding:{x:6,y:6} }).setInteractive(); back.on('pointerdown', ()=> { this.previewPanel.destroy(); this.uiGroup.setVisible(true); }); this.previewPanel.add([buy, back]); } }
function notifyInsufficient(){ this.add.text(200,560, 'Not enough coins!', { font:'16px monospace', fill:'#f00' }).setDepth(110).setAlpha(1).setInteractive().on('pointerdown', function(){ this.destroy(); }); }
function generateShopRound(playerState){ const kinds=['player','perk','upgrade']; const cardSlots=[]; for(let i=0;i<3;i++){ cardSlots.push({ card:{ displayName: ['common','bronze','silver','gold'][Math.floor(Math.random()*4)]+' player', kind:kinds[Math.floor(Math.random()*kinds.length)], rarity:['common','bronze','silver','gold'][Math.floor(Math.random()*4)] }, price: Math.floor(Math.random()*40)+5 }); } const packSlots=[]; const packTypes=['standard','jumbo','ultra']; for(let i=0;i<2;i++){ packSlots.push({ packType: packTypes[Math.floor(Math.random()*packTypes.length)], packRarity:['common','bronze','silver'][Math.floor(Math.random()*3)], cards:[{displayName:'common player',rarity:'common'},{displayName:'bronze perk',rarity:'bronze'},{displayName:'silver upgrade',rarity:'silver'}], price: Math.floor(Math.random()*80)+10 }); } return { cardSlots, packSlots, timestamp: Date.now() }; }
function openPack(p){ return p.cards.slice(); }
function applyCardToPlayer(card){
  if(card.kind === 'perk'){
    const p = { name: card.displayName, type:'perk', stat: 'contact', boost: 2, rarity: card.rarity, cost: 0 };
    const main = game.scene.keys['MainScene'];
    if(main){
      main.gameState.teamPlayers.forEach(tp => { tp.perksApplied = tp.perksApplied || {}; tp.perksApplied['contact'] = (tp.perksApplied['contact']||0) + p.boost; });
    }
    // notify
    console.log('Perk applied', p);
  } else if(card.kind === 'player'){
    const cur = JSON.parse(localStorage.getItem('currentPlayer')||'null');
    if(cur){ cur.collection = cur.collection||[]; cur.collection.push(card); localStorage.setItem('currentPlayer', JSON.stringify(cur)); }
  } else if(card.kind === 'upgrade'){
    const cur = JSON.parse(localStorage.getItem('currentPlayer')||'null');
    if(cur){ cur.perksApplied = cur.perksApplied || {}; cur.perksApplied['contact'] = (cur.perksApplied['contact']||0) + 2; localStorage.setItem('currentPlayer', JSON.stringify(cur)); }
  }
}

/* Matchup & At-bat logic (simplified) */
function getEffectivePitcherRating(pitcher, pitchType){
  const rating = (pitcher.pitches && pitcher.pitches[pitchType]) ? pitcher.pitches[pitchType] : (pitcher[pitchType]||50);
  return Math.round(Math.max(1, rating));
}
function calculateHitChance(pitcher, batter, pitchType, swingType){
  const effPitch = getEffectivePitcherRating(pitcher, pitchType);
  let baseHitChance = 50;
  baseHitChance -= effPitch * 0.35;
  if(swingType === 'contact') baseHitChance += (batter.contact || 50) * 0.28;
  if(swingType === 'power') baseHitChance += (batter.power || 50) * 0.22;
  const repeatCount = (batter.pitchHistory || []).filter(p => p===pitchType).length;
  baseHitChance += repeatCount * ((batter.eye || 50) * 0.18);
  return Phaser.Math.Clamp(Math.round(baseHitChance), 5, 95);
}
function chooseSwing(batter, count, runners){
  if(runners > 0 && count.strikes < 2) return 'bunt';
  if(count.strikes === 2) return 'contact';
  const roll = Phaser.Math.Between(1,100);
  if(roll <= (batter.power || 40)) return 'power';
  return 'contact';
}
function selectPitch(pitcher, batter, count){
  const pitchKeys = Object.keys(pitcher.pitches || { fastball:60, curveball:50 });
  let selected;
  const roll = Phaser.Math.Between(1,100);
  if(roll <= 70) selected = pitchKeys.reduce((a,b) => (pitcher.pitches[a] || 50) > (pitcher.pitches[b] ||50) ? a : b);
  else selected = pitchKeys[Phaser.Math.Between(0,pitchKeys.length-1)];
  if(count.strikes === 2 && Phaser.Math.Between(1,100) <= 60){
    const off = pitchKeys.filter(p => p !== 'fastball'); if(off.length) selected = off[Phaser.Math.Between(0,off.length-1)];
  }
  return selected;
}
function checkWalk(pitcher){
  const walkChance = Math.max(0, 20 - ((pitcher.control || 50)-40)*0.5);
  return Phaser.Math.Between(1,100) <= walkChance;
}
function resolveAtBat(pitcher, batter, count, runners){
  if(checkWalk(pitcher)) return { outcome:'walk', pitchType:null, swingType:null };
  const pitchType = selectPitch(pitcher, batter, count);
  const swingType = chooseSwing(batter, count, runners);
  const hitChance = calculateHitChance(pitcher, batter, pitchType, swingType);
  const roll = Phaser.Math.Between(1,100);
  let outcome = 'strike';
  if(roll <= hitChance) {
    if(swingType === 'power' && Phaser.Math.Between(1,100) <= ((batter.power||50) * 0.12)) outcome = 'extraBaseHit';
    else outcome = 'single';
  } else {
    if(swingType === 'bunt') outcome = 'buntFail';
    else outcome = 'strike';
  }
  batter.pitchHistory = batter.pitchHistory || [];
  batter.pitchHistory.push(pitchType);
  if(batter.pitchHistory.length > 3) batter.pitchHistory.shift();
  pitcher.stamina = Math.max(0, (pitcher.stamina||100) - 1);
  return { outcome, pitchType, swingType };
}
