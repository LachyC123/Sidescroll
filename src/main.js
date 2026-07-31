import Phaser from 'phaser';
import './styles.css';

const W = 1280;
const H = 720;
const FLOOR = 620;

class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  create() {
    const g = this.add.graphics();
    g.fillStyle(0x263746).fillRoundedRect(0, 0, 40, 64, 8);
    g.fillStyle(0xe4c999).fillCircle(20, 14, 10);
    g.fillStyle(0x79a9bd).fillRect(7, 25, 26, 28);
    g.fillStyle(0xe7edf0).fillRect(28, 31, 18, 5);
    g.generateTexture('hero', 48, 64); g.clear();
    g.fillStyle(0x4a3038).fillRoundedRect(0, 0, 42, 58, 7);
    g.fillStyle(0xb96562).fillCircle(21, 13, 9);
    g.fillStyle(0x7b4348).fillRect(6, 24, 30, 25);
    g.generateTexture('enemy', 42, 58); g.clear();
    g.fillStyle(0x55724c).fillRect(0, 0, 64, 64);
    g.fillStyle(0x7fa46b).fillRect(0, 0, 64, 12);
    g.generateTexture('ground', 64, 64); g.clear();
    g.fillStyle(0x84d8ff).fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8); g.destroy();
    this.scene.start('GameScene');
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.health = 5;
    this.score = 0;
    this.facing = 1;
    this.attackReady = true;
    this.dead = false;
    this.won = false;
    this.checkpoint = { x: 150, y: 540 };
    this.touch = { left: false, right: false, jump: false, attack: false };

    this.physics.world.setBounds(0, 0, 3000, H);
    this.createWorld();
    this.createPlayer();
    this.createEnemies();
    this.createHUD();
    this.createTouchControls();
    this.createTutorial();

    this.cameras.main.setBounds(0, 0, 3000, H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -160, 35);
    this.cameras.main.setDeadzone(260, 150);

    this.keys = this.input.keyboard.addKeys('A,D,W,SPACE,J,K,R');
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  createWorld() {
    this.cameras.main.setBackgroundColor('#101923');
    this.add.rectangle(1500, 210, 3000, 420, 0x172738).setScrollFactor(0.15);
    for (let x = 60; x < 3000; x += 170) {
      const h = Phaser.Math.Between(120, 280);
      this.add.triangle(x, FLOOR - 60, 0, h, 80, 0, 160, h, 0x203344).setScrollFactor(0.42).setAlpha(0.75);
    }

    this.platforms = this.physics.add.staticGroup();
    for (let x = 32; x < 3000; x += 64) this.platforms.create(x, FLOOR + 32, 'ground');
    [[500,500,180,22],[840,440,190,22],[1190,510,180,22],[1540,450,210,22],[1900,390,190,22],[2250,485,220,22]].forEach(([x,y,w,h]) => {
      const p = this.add.rectangle(x,y,w,h,0x56754f).setStrokeStyle(2,0x78906f);
      this.physics.add.existing(p,true); this.platforms.add(p);
    });

    this.add.text(90, 470, 'THE OLD ROAD', { fontFamily:'Georgia,serif', fontSize:'34px', color:'#f0ddb1' });
    this.add.text(90, 512, 'A short path into a much larger world.', { fontSize:'16px', color:'#aebdca' });

    this.checkpointMarker = this.add.rectangle(1450, 522, 28, 130, 0x765f3b).setStrokeStyle(3,0xd8bd79);
    this.add.circle(1450, 448, 14, 0xe2c469).setDepth(2);
    this.physics.add.existing(this.checkpointMarker, true);

    this.exit = this.add.rectangle(2790, 490, 110, 250, 0x34495a).setStrokeStyle(6, 0xd5b56e);
    this.physics.add.existing(this.exit, true);
    this.add.text(2790, 345, 'OLD GATE', { fontFamily:'Georgia,serif', fontSize:'20px', color:'#f1d995', fontStyle:'bold' }).setOrigin(0.5);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(this.checkpoint.x, this.checkpoint.y, 'hero').setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(1500).setSize(32,58).setOffset(8,6).setMaxVelocity(340,900);
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.checkpointMarker, () => this.activateCheckpoint());

    this.attackZone = this.add.zone(0,0,76,58);
    this.physics.add.existing(this.attackZone);
    this.attackZone.body.setAllowGravity(false);
    this.attackZone.body.enable = false;
  }

  createEnemies() {
    this.enemies = this.physics.add.group();
    [700,1050,1320,1710,2060,2400,2620].forEach((x,i) => {
      const e = this.enemies.create(x,548,'enemy');
      e.setData({ hp:i > 4 ? 3 : 2, maxHp:i > 4 ? 3 : 2, originX:x, dir:-1, lastHit:0, state:'patrol' });
      e.body.setGravityY(1500).setSize(34,54).setOffset(4,4);
      e.hpBack = this.add.rectangle(x, e.y-44, 44, 6, 0x1b2028).setDepth(20);
      e.hpBar = this.add.rectangle(x-21, e.y-44, 42, 4, 0xd06a5f).setOrigin(0,0.5).setDepth(21);
    });
    this.physics.add.collider(this.enemies,this.platforms);
    this.physics.add.overlap(this.player,this.enemies,(_,e)=>this.hurtPlayer(e));
    this.physics.add.overlap(this.attackZone,this.enemies,(_,e)=>this.hitEnemy(e));
  }

  createHUD() {
    const panel = this.add.rectangle(18,18,300,76,0x091019,0.82).setOrigin(0).setStrokeStyle(2,0x42566a).setScrollFactor(0).setDepth(50);
    this.healthText = this.add.text(36,32,'',{fontSize:'18px',color:'#f3d9ba',fontStyle:'bold'}).setScrollFactor(0).setDepth(51);
    this.scoreText = this.add.text(36,61,'',{fontSize:'14px',color:'#e9c86d'}).setScrollFactor(0).setDepth(51);
    this.objectiveText = this.add.text(W-28,28,'OBJECTIVE: Reach the old gate',{fontSize:'15px',color:'#d8e2ea',fontStyle:'bold'}).setOrigin(1,0).setScrollFactor(0).setDepth(51);
    this.notice = this.add.text(W/2,80,'',{fontSize:'17px',color:'#f8e5b9',backgroundColor:'#101820dd',padding:{x:16,y:9}}).setOrigin(0.5,0).setScrollFactor(0).setDepth(60).setAlpha(0);
    this.refreshHUD();
  }

  createTouchControls() {
    const make = (x,y,label,key) => {
      const b = this.add.circle(x,y,40,0x0a1018,0.55).setStrokeStyle(2,0xd8e2ea,0.3).setScrollFactor(0).setDepth(60).setInteractive();
      this.add.text(x,y,label,{fontSize:'24px',color:'#f3e5c6',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(61);
      b.on('pointerdown',()=>{this.touch[key]=true;b.setAlpha(0.95);});
      ['pointerup','pointerout'].forEach(ev=>b.on(ev,()=>{this.touch[key]=false;b.setAlpha(1);}));
    };
    make(72,H-65,'◀','left'); make(166,H-65,'▶','right'); make(W-160,H-65,'↑','jump'); make(W-68,H-65,'⚔','attack');
  }

  createTutorial() {
    this.tutorialSteps = [
      { x:220, text:'Move with A/D or the arrow buttons' },
      { x:560, text:'Jump with W, Space or ↑' },
      { x:850, text:'Attack with J, K or ⚔' },
      { x:1460, text:'Checkpoint reached — defeats now return you here' }
    ];
    this.tutorialIndex = 0;
    this.showNotice('Move with A/D or the arrow buttons');
  }

  showNotice(text) {
    this.notice.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.notice);
    this.tweens.add({ targets:this.notice, alpha:0, delay:2400, duration:450 });
  }

  update(time) {
    if (this.won || this.dead) return;
    const b = this.player.body;
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.right;
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || this.touch.jump;
    const attack = Phaser.Input.Keyboard.JustDown(this.keys.J) || Phaser.Input.Keyboard.JustDown(this.keys.K) || this.touch.attack;

    if (left === right) b.setVelocityX(Phaser.Math.Linear(b.velocity.x,0,0.24));
    else { this.facing = left ? -1 : 1; b.setVelocityX(this.facing*285); this.player.setFlipX(this.facing<0); }
    if (jump && (b.blocked.down || b.touching.down)) { b.setVelocityY(-610); this.burst(this.player.x,this.player.y+28,0xb9d5df,5); }
    this.touch.jump = false;
    if (attack && this.attackReady) this.attack();
    this.touch.attack = false;

    this.attackZone.setPosition(this.player.x + this.facing*52,this.player.y);
    this.updateEnemies(time);
    this.updateTutorial();
    if (this.player.y > H+40) this.killPlayer();
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(),this.exit.getBounds()) && this.enemies.countActive(true)===0) this.win();
  }

  updateTutorial() {
    if (this.tutorialIndex >= this.tutorialSteps.length) return;
    const step = this.tutorialSteps[this.tutorialIndex];
    if (this.player.x >= step.x) { if (this.tutorialIndex>0) this.showNotice(step.text); this.tutorialIndex += 1; }
  }

  attack() {
    this.attackReady = false;
    this.attackZone.body.enable = true;
    this.player.setTint(0xffffff);
    const slash = this.add.arc(this.player.x+this.facing*42,this.player.y,44,this.facing>0?285:105,this.facing>0?75:255,false,0xeaf7ff,0.62).setDepth(12);
    this.tweens.add({targets:slash,alpha:0,scale:1.35,duration:130,onComplete:()=>slash.destroy()});
    this.cameras.main.shake(60,0.002);
    this.time.delayedCall(100,()=>{this.attackZone.body.enable=false;this.player.clearTint();});
    this.time.delayedCall(290,()=>this.attackReady=true);
  }

  hitEnemy(e) {
    if (!e.active || this.time.now-e.getData('lastHit')<220) return;
    e.setData('lastHit',this.time.now);
    e.setData('hp',e.getData('hp')-1);
    e.setVelocity(this.facing*370,-220).setTintFill(0xffffff);
    this.time.delayedCall(90,()=>e.active&&e.clearTint());
    this.burst(e.x,e.y,0xffd27a,10);
    const ratio = Math.max(0,e.getData('hp')/e.getData('maxHp'));
    e.hpBar.width = 42*ratio;
    if (e.getData('hp')<=0) {
      this.score += 100; this.refreshHUD();
      e.hpBack.destroy(); e.hpBar.destroy();
      this.tweens.add({targets:e,alpha:0,angle:this.facing*30,y:e.y-35,duration:260,onComplete:()=>e.destroy()});
      if (this.enemies.countActive(true)<=1) this.objectiveText.setText('OBJECTIVE: Enter the old gate');
    }
  }

  hurtPlayer(e) {
    if (this.player.getData('invulnerable') || this.dead) return;
    this.player.setData('invulnerable',true);
    this.health -= 1; this.refreshHUD();
    this.player.setVelocity(e.x<this.player.x?420:-420,-320).setTintFill(0xff8b8b);
    this.cameras.main.shake(150,0.008);
    this.time.delayedCall(900,()=>{this.player.setData('invulnerable',false);this.player.clearTint();});
    if (this.health<=0) this.time.delayedCall(250,()=>this.killPlayer());
  }

  updateEnemies() {
    this.enemies.children.iterate(e=>{
      if (!e?.active) return;
      const d = this.player.x-e.x;
      if (Math.abs(d)<300) { e.setData('state','chase'); e.setVelocityX(Math.sign(d)*92); }
      else { let dir=e.getData('dir'); const o=e.getData('originX'); if(e.x<o-90)dir=1;if(e.x>o+90)dir=-1;e.setData('dir',dir);e.setData('state','patrol');e.setVelocityX(dir*45); }
      e.setFlipX(e.body.velocity.x>0);
      e.hpBack.setPosition(e.x,e.y-44); e.hpBar.setPosition(e.x-21,e.y-44);
    });
  }

  activateCheckpoint() {
    if (this.checkpoint.x===1450) return;
    this.checkpoint={x:1450,y:540};
    this.checkpointMarker.setFillStyle(0x8b743e);
    this.showNotice('Checkpoint activated');
    this.cameras.main.flash(180,220,196,105);
  }

  killPlayer() {
    if (this.dead) return;
    this.dead=true;
    this.player.setVelocity(0,0);
    this.showNotice('Fallen — returning to the last checkpoint');
    this.cameras.main.fadeOut(550,8,12,18);
    this.time.delayedCall(620,()=>{
      this.health=5; this.refreshHUD();
      this.player.setPosition(this.checkpoint.x,this.checkpoint.y).setVelocity(0,0).clearTint();
      this.player.setData('invulnerable',false);
      this.cameras.main.fadeIn(450,8,12,18); this.dead=false;
    });
  }

  burst(x,y,colour,n) {
    for(let i=0;i<n;i++){
      const p=this.add.image(x,y,'spark').setTint(colour).setDepth(30);
      const a=Phaser.Math.FloatBetween(0,Math.PI*2),d=Phaser.Math.Between(24,72);
      this.tweens.add({targets:p,x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,alpha:0,scale:0.2,duration:Phaser.Math.Between(220,420),onComplete:()=>p.destroy()});
    }
  }

  refreshHUD() {
    this.healthText.setText(`VITALITY  ${'◆'.repeat(Math.max(0,this.health))}${'◇'.repeat(Math.max(0,5-this.health))}`);
    this.scoreText.setText(`RENOWN  ${String(this.score).padStart(4,'0')}`);
  }

  win() {
    this.won=true; this.player.setVelocity(0,0);
    this.add.rectangle(W/2,H/2,W,H,0x081018,0.84).setScrollFactor(0).setDepth(100);
    this.add.text(W/2,H/2-62,'ROAD CLEARED',{fontFamily:'Georgia,serif',fontSize:'54px',color:'#f0d99d'}).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.add.text(W/2,H/2+10,`Renown earned: ${this.score}\nThe path beyond the gate will become the first full level.`,{fontSize:'19px',align:'center',color:'#d7e1e8',lineSpacing:10}).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    const restart=this.add.text(W/2,H/2+110,'PLAY AGAIN',{fontSize:'18px',fontStyle:'bold',color:'#111820',backgroundColor:'#e5c978',padding:{x:22,y:12}}).setOrigin(0.5).setScrollFactor(0).setDepth(101).setInteractive();
    restart.on('pointerdown',()=>this.scene.restart());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#111821',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: { default:'arcade', arcade:{ gravity:{y:0}, debug:false } },
  scale: { mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH },
  scene: [BootScene,GameScene]
});
