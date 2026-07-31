import Phaser from 'phaser';
import './styles.css';

const W = 1280;
const H = 720;
const FLOOR_Y = 620;
const WORLD_W = 3000;

class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    this.makeTextures();
    this.scene.start('TitleScene');
  }

  makeTextures() {
    const g = this.add.graphics();

    g.fillStyle(0x263746).fillRoundedRect(0, 0, 38, 64, 8);
    g.fillStyle(0xe1c58e).fillCircle(19, 14, 10);
    g.fillStyle(0x8fc6d9).fillRect(7, 25, 24, 28);
    g.fillStyle(0xd7e6ef).fillRect(26, 31, 18, 5);
    g.generateTexture('hero', 48, 64); g.clear();

    g.fillStyle(0x432f39).fillRoundedRect(0, 0, 40, 58, 7);
    g.fillStyle(0xb96562).fillCircle(20, 13, 9);
    g.fillStyle(0x7b4348).fillRect(6, 24, 28, 25);
    g.fillStyle(0xf0c36a).fillTriangle(7, 23, 20, 7, 33, 23);
    g.generateTexture('enemy', 40, 58); g.clear();

    g.fillStyle(0x7fa46b).fillRect(0, 0, 64, 64);
    g.fillStyle(0x56754f).fillRect(0, 0, 64, 12);
    g.fillStyle(0x3f5642).fillRect(0, 12, 64, 5);
    g.generateTexture('ground', 64, 64); g.clear();

    g.fillStyle(0xeec86d).fillCircle(8, 8, 7);
    g.fillStyle(0xfff1a6).fillCircle(8, 8, 3);
    g.generateTexture('coin', 16, 16); g.clear();

    g.fillStyle(0x84d8ff).fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8); g.clear();

    g.fillStyle(0xd9c178).fillRect(0, 0, 22, 74);
    g.fillStyle(0x7f6440).fillRect(8, 0, 6, 74);
    g.fillStyle(0x5ed2b0).fillCircle(11, 13, 8);
    g.generateTexture('checkpoint', 22, 74);
    g.destroy();
  }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    this.cameras.main.setBackgroundColor('#09111a');
    this.add.rectangle(W / 2, H / 2, W, H, 0x101d29);
    for (let x = 30; x < W; x += 110) {
      this.add.circle(x, Phaser.Math.Between(80, 610), Phaser.Math.Between(1, 3), 0xb9d8e8, 0.45);
    }
    this.add.text(W / 2, 190, 'LEGACY FANTASY', {
      fontFamily: 'Georgia, serif', fontSize: '72px', color: '#f1dfae', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(W / 2, 275, 'THE OLD ROAD', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#8fc7d8', letterSpacing: 8
    }).setOrigin(0.5);
    this.add.text(W / 2, 350, 'A short browser action-platformer tutorial slice', {
      fontSize: '18px', color: '#9fb0bd'
    }).setOrigin(0.5);

    const start = this.add.text(W / 2, 455, 'BEGIN JOURNEY', {
      fontSize: '24px', color: '#f7e5b9', backgroundColor: '#203446', padding: { x: 30, y: 16 }, fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerover', () => start.setScale(1.04));
    start.on('pointerout', () => start.setScale(1));
    start.on('pointerdown', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown', () => this.scene.start('GameScene'));

    this.add.text(W / 2, 535, 'Keyboard, touch and controller-friendly layout', {
      fontSize: '14px', color: '#718391'
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.score = 0;
    this.health = 5;
    this.maxHealth = 5;
    this.facing = 1;
    this.attackReady = true;
    this.gameWon = false;
    this.respawning = false;
    this.checkpointX = 170;
    this.tutorialStage = 0;
    this.touch = { left: false, right: false, jump: false, attack: false };

    this.physics.world.setBounds(0, 0, WORLD_W, H);
    this.createWorld();
    this.createPlayer();
    this.createEnemies();
    this.createCollectibles();
    this.createHUD();
    this.createControls();

    this.cameras.main.setBounds(0, 0, WORLD_W, H);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09, -180, 45);
    this.cameras.main.setDeadzone(260, 160);

    this.keys = this.input.keyboard.addKeys('A,D,W,SPACE,J,K,R');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.showTutorial('MOVE', 'Use A/D, arrow keys or the left touch buttons.', 0);
  }

  createWorld() {
    this.cameras.main.setBackgroundColor('#101a25');
    this.add.rectangle(WORLD_W / 2, 210, WORLD_W, 420, 0x172738).setScrollFactor(0.2);
    for (let x = 80; x < WORLD_W; x += 180) {
      const height = Phaser.Math.Between(120, 270);
      this.add.triangle(x, FLOOR_Y - 70, 0, height, 80, 0, 160, height, 0x203344)
        .setScrollFactor(0.45).setAlpha(0.8);
    }

    this.platforms = this.physics.add.staticGroup();
    for (let x = 32; x < WORLD_W; x += 64) this.platforms.create(x, FLOOR_Y + 32, 'ground');

    [[520, 500, 190, 24], [840, 435, 180, 24], [1220, 515, 190, 24], [1580, 450, 220, 24], [1940, 385, 190, 24], [2320, 475, 180, 24]].forEach(([x,y,w,h]) => {
      const p = this.add.rectangle(x, y, w, h, 0x56754f).setStrokeStyle(2, 0x79906e);
      this.physics.add.existing(p, true);
      this.platforms.add(p);
    });

    this.add.text(90, 485, 'THE OLD ROAD', { fontFamily: 'Georgia, serif', fontSize: '34px', color: '#f2dfb3' }).setAlpha(0.85);
    this.add.text(90, 530, 'Reach the gate. Defeat anything blocking the path.', { fontSize: '16px', color: '#aebdca' });

    this.checkpoint = this.physics.add.staticImage(1430, 565, 'checkpoint').setDepth(3);
    this.add.text(1430, 505, 'WAYSTONE', { fontSize: '13px', color: '#8fe4cf', fontStyle: 'bold' }).setOrigin(0.5);

    this.exit = this.add.rectangle(2820, 490, 100, 240, 0x34495a).setStrokeStyle(6, 0xd5b56e);
    this.physics.add.existing(this.exit, true);
    this.add.text(2820, 350, 'OLD GATE', { fontSize: '18px', color: '#f1d995', fontStyle: 'bold' }).setOrigin(0.5);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(this.checkpointX, 540, 'hero');
    this.player.setDepth(5).setCollideWorldBounds(true);
    this.player.body.setSize(32, 58).setOffset(6, 6).setGravityY(1500).setMaxVelocity(340, 900);
    this.physics.add.collider(this.player, this.platforms);

    this.attackZone = this.add.zone(0, 0, 82, 62);
    this.physics.add.existing(this.attackZone);
    this.attackZone.body.setAllowGravity(false);
    this.attackZone.body.enable = false;
    this.physics.add.overlap(this.player, this.checkpoint, () => this.activateCheckpoint());
  }

  createEnemies() {
    this.enemies = this.physics.add.group();
    [720, 1110, 1670, 2050, 2460, 2660].forEach((x, i) => {
      const enemy = this.enemies.create(x, 548, 'enemy');
      const elite = i === 5;
      enemy.setScale(elite ? 1.22 : 1);
      enemy.setData({ hp: elite ? 5 : 2, maxHp: elite ? 5 : 2, originX: x, direction: -1, lastHit: 0, state: 'patrol', attackAt: 0 });
      enemy.body.setGravityY(1500).setSize(34, 54).setOffset(3, 4);
      this.createEnemyBar(enemy);
    });
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.enemies, (_, enemy) => this.hurtPlayer(enemy));
    this.physics.add.overlap(this.attackZone, this.enemies, (_, enemy) => this.hitEnemy(enemy));
  }

  createEnemyBar(enemy) {
    const bg = this.add.rectangle(enemy.x, enemy.y - 46, 44, 6, 0x160f14).setDepth(8);
    const fill = this.add.rectangle(enemy.x - 21, enemy.y - 46, 42, 4, 0xd36f69).setOrigin(0, 0.5).setDepth(9);
    enemy.setData('barBg', bg);
    enemy.setData('barFill', fill);
  }

  createCollectibles() {
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    [[520,460],[840,395],[1220,475],[1580,410],[1940,345],[2320,435]].forEach(([x,y]) => {
      const coin = this.coins.create(x, y, 'coin');
      this.tweens.add({ targets: coin, y: y - 10, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
    this.physics.add.overlap(this.player, this.coins, (_, coin) => {
      coin.disableBody(true, true);
      this.score += 25;
      this.burst(coin.x, coin.y, 0xffdf7b, 10);
      this.refreshHUD();
    });
  }

  createHUD() {
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(50);
    const panel = this.add.rectangle(20, 18, 320, 92, 0x091019, 0.88).setOrigin(0).setStrokeStyle(2, 0x42566a);
    this.healthText = this.add.text(40, 34, '', { fontSize: '20px', color: '#f3d9ba', fontStyle: 'bold' });
    this.scoreText = this.add.text(40, 68, '', { fontSize: '16px', color: '#e9c86d' });
    this.objectiveText = this.add.text(W - 30, 28, 'OBJECTIVE: Reach the old gate', { fontSize: '16px', color: '#d8e2ea', fontStyle: 'bold' }).setOrigin(1, 0);
    this.tutorialPanel = this.add.rectangle(W / 2, 90, 560, 76, 0x0b131d, 0.94).setStrokeStyle(2, 0x557087).setOrigin(0.5, 0);
    this.tutorialTitle = this.add.text(W / 2, 104, '', { fontSize: '15px', color: '#e9c86d', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.tutorialText = this.add.text(W / 2, 130, '', { fontSize: '16px', color: '#e2e9ee' }).setOrigin(0.5, 0);
    this.hud.add([panel, this.healthText, this.scoreText, this.objectiveText, this.tutorialPanel, this.tutorialTitle, this.tutorialText]);
    this.refreshHUD();
  }

  showTutorial(title, text, stage) {
    this.tutorialStage = stage;
    this.tutorialTitle.setText(`TUTORIAL — ${title}`);
    this.tutorialText.setText(text);
    this.tutorialPanel.setAlpha(1); this.tutorialTitle.setAlpha(1); this.tutorialText.setAlpha(1);
  }

  hideTutorial() {
    this.tweens.add({ targets: [this.tutorialPanel, this.tutorialTitle, this.tutorialText], alpha: 0, duration: 350 });
  }

  createControls() {
    const makeButton = (x, y, label, key) => {
      const b = this.add.circle(x, y, 42, 0x0a1018, 0.58).setStrokeStyle(2, 0xd8e2ea, 0.35)
        .setScrollFactor(0).setDepth(60).setInteractive();
      const t = this.add.text(x, y, label, { fontSize: '26px', color: '#f3e5c6', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(61);
      b.on('pointerdown', () => { this.touch[key] = true; b.setScale(0.92); });
      const release = () => { this.touch[key] = false; b.setScale(1); };
      b.on('pointerup', release); b.on('pointerout', release);
      return [b, t];
    };
    makeButton(78, H - 72, '◀', 'left');
    makeButton(176, H - 72, '▶', 'right');
    makeButton(W - 170, H - 72, '↑', 'jump');
    makeButton(W - 72, H - 72, '⚔', 'attack');
  }

  update(time) {
    if (this.gameWon || this.respawning) return;

    const body = this.player.body;
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.right;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || this.touch.jump;
    const attackPressed = Phaser.Input.Keyboard.JustDown(this.keys.J) || Phaser.Input.Keyboard.JustDown(this.keys.K) || this.touch.attack;

    if (left === right) body.setVelocityX(Phaser.Math.Linear(body.velocity.x, 0, 0.22));
    else {
      this.facing = left ? -1 : 1;
      body.setVelocityX(this.facing * 285);
      this.player.setFlipX(this.facing < 0);
      if (this.tutorialStage === 0 && this.player.x > 280) this.showTutorial('JUMP', 'Press W, Space, Up or the jump button.', 1);
    }

    if (jumpPressed && (body.blocked.down || body.touching.down)) {
      body.setVelocityY(-610);
      this.burst(this.player.x, this.player.y + 30, 0xb9d5df, 5);
      if (this.tutorialStage === 1) this.showTutorial('COMBAT', 'Press J, K or the sword button to attack.', 2);
    }
    this.touch.jump = false;

    if (attackPressed && this.attackReady) {
      this.attack();
      if (this.tutorialStage === 2) { this.hideTutorial(); this.tutorialStage = 3; }
    }
    this.touch.attack = false;

    this.attackZone.setPosition(this.player.x + this.facing * 50, this.player.y);
    this.updateEnemies(time);
    this.updateEnemyBars();

    if (this.player.y > H + 40) this.respawn();
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(), this.exit.getBounds()) && this.enemies.countActive(true) === 0) this.win();
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.respawn();
  }

  attack() {
    this.attackReady = false;
    this.attackZone.body.enable = true;
    this.player.setTint(0xffffff);
    this.cameras.main.shake(70, 0.002);
    const slash = this.add.arc(this.player.x + this.facing * 42, this.player.y, 42, this.facing > 0 ? 285 : 105, this.facing > 0 ? 75 : 255, false, 0xeaf7ff, 0.55).setDepth(7);
    this.tweens.add({ targets: slash, alpha: 0, scale: 1.35, duration: 120, onComplete: () => slash.destroy() });
    this.time.delayedCall(95, () => { this.attackZone.body.enable = false; this.player.clearTint(); });
    this.time.delayedCall(300, () => { this.attackReady = true; });
  }

  hitEnemy(enemy) {
    const now = this.time.now;
    if (!enemy.active || now - enemy.getData('lastHit') < 220) return;
    enemy.setData('lastHit', now);
    enemy.setData('hp', enemy.getData('hp') - 1);
    enemy.setData('state', 'hurt');
    enemy.setVelocity(this.facing * 360, -220);
    enemy.setTintFill(0xffffff);
    this.cameras.main.shake(90, 0.004);
    this.time.delayedCall(90, () => enemy.active && enemy.clearTint());
    this.time.delayedCall(260, () => enemy.active && enemy.setData('state', 'chase'));
    this.burst(enemy.x, enemy.y, 0xffd27a, 9);

    if (enemy.getData('hp') <= 0) {
      this.score += 100;
      this.refreshHUD();
      enemy.getData('barBg')?.destroy(); enemy.getData('barFill')?.destroy();
      this.tweens.add({ targets: enemy, alpha: 0, angle: this.facing * 28, y: enemy.y - 30, duration: 260, onComplete: () => enemy.destroy() });
      if (this.enemies.countActive(true) <= 1) this.objectiveText.setText('OBJECTIVE: Enter the old gate');
    }
  }

  hurtPlayer(enemy) {
    if (this.player.getData('invulnerable') || this.respawning) return;
    this.player.setData('invulnerable', true);
    this.health -= 1;
    this.refreshHUD();
    this.player.setVelocity(enemy.x < this.player.x ? 420 : -420, -320);
    this.player.setTintFill(0xff8b8b);
    this.cameras.main.shake(150, 0.008);
    this.time.delayedCall(900, () => { if (this.player.active) { this.player.setData('invulnerable', false); this.player.clearTint(); } });
    if (this.health <= 0) this.time.delayedCall(350, () => this.respawn());
  }

  updateEnemies(time) {
    this.enemies.children.iterate(enemy => {
      if (!enemy?.active) return;
      const state = enemy.getData('state');
      if (state === 'hurt') return;
      const distance = this.player.x - enemy.x;
      if (Math.abs(distance) < 320) {
        enemy.setData('state', 'chase');
        enemy.setVelocityX(Math.sign(distance) * 94);
        enemy.setFlipX(distance > 0);
      } else {
        enemy.setData('state', 'patrol');
        const origin = enemy.getData('originX');
        let direction = enemy.getData('direction');
        if (enemy.x < origin - 100) direction = 1;
        if (enemy.x > origin + 100) direction = -1;
        enemy.setData('direction', direction);
        enemy.setVelocityX(direction * 42);
        enemy.setFlipX(direction > 0);
      }
      enemy.y += Math.sin(time / 220 + enemy.x) * 0.08;
    });
  }

  updateEnemyBars() {
    this.enemies.children.iterate(enemy => {
      if (!enemy?.active) return;
      const bg = enemy.getData('barBg'); const fill = enemy.getData('barFill');
      if (!bg || !fill) return;
      bg.setPosition(enemy.x, enemy.y - 46);
      fill.setPosition(enemy.x - 21, enemy.y - 46);
      fill.width = 42 * Math.max(0, enemy.getData('hp') / enemy.getData('maxHp'));
    });
  }

  activateCheckpoint() {
    if (this.checkpointX >= 1430) return;
    this.checkpointX = 1430;
    this.checkpoint.setTint(0x88ffe0);
    this.score += 50;
    this.refreshHUD();
    this.burst(this.checkpoint.x, this.checkpoint.y - 20, 0x78efcf, 18);
    this.showToast('WAYSTONE AWAKENED', 'Your journey will resume here.');
  }

  respawn() {
    if (this.respawning || this.gameWon) return;
    this.respawning = true;
    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.time.delayedCall(300, () => {
      this.health = this.maxHealth;
      this.player.setPosition(this.checkpointX, 520).setVelocity(0, 0).clearTint().setAlpha(1);
      this.player.setData('invulnerable', true);
      this.refreshHUD();
      this.cameras.main.fadeIn(350, 0, 0, 0);
      this.time.delayedCall(700, () => this.player.setData('invulnerable', false));
      this.respawning = false;
    });
  }

  burst(x, y, colour, amount) {
    for (let i = 0; i < amount; i++) {
      const p = this.add.image(x, y, 'spark').setTint(colour).setDepth(20);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(25, 70);
      this.tweens.add({ targets: p, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.2, duration: Phaser.Math.Between(220, 430), onComplete: () => p.destroy() });
    }
  }

  showToast(title, subtitle) {
    const box = this.add.rectangle(W / 2, 220, 440, 90, 0x0b151d, 0.95).setStrokeStyle(2, 0x75cfb7).setScrollFactor(0).setDepth(90);
    const a = this.add.text(W / 2, 198, title, { fontSize: '20px', color: '#dff9ed', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const b = this.add.text(W / 2, 232, subtitle, { fontSize: '15px', color: '#9eb9b0' }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    this.time.delayedCall(1800, () => this.tweens.add({ targets: [box,a,b], alpha: 0, duration: 400, onComplete: () => { box.destroy(); a.destroy(); b.destroy(); } }));
  }

  refreshHUD() {
    this.healthText.setText(`VITALITY  ${'◆'.repeat(Math.max(0, this.health))}${'◇'.repeat(Math.max(0, this.maxHealth - this.health))}`);
    this.scoreText.setText(`RENOWN  ${String(this.score).padStart(4, '0')}`);
  }

  win() {
    this.gameWon = true;
    this.player.body.setVelocity(0, 0);
    this.cameras.main.flash(300, 225, 205, 145);
    this.add.rectangle(W / 2, H / 2, W, H, 0x081018, 0.86).setScrollFactor(0).setDepth(100);
    this.add.text(W / 2, H / 2 - 80, 'ROAD CLEARED', { fontFamily: 'Georgia, serif', fontSize: '58px', color: '#f0db9e' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.add.text(W / 2, H / 2, `Final renown: ${this.score}`, { fontSize: '22px', color: '#c3d4df' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    const again = this.add.text(W / 2, H / 2 + 85, 'PLAY AGAIN', { fontSize: '20px', color: '#fff0c9', backgroundColor: '#25394a', padding: { x: 24, y: 14 }, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#0b1118',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, GameScene]
};

new Phaser.Game(config);
