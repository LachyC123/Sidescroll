import Phaser from 'phaser';
import './styles.css';

const W = 1280;
const H = 720;
const FLOOR_Y = 620;

class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    this.makeTextures();
    this.scene.start('GameScene');
  }

  makeTextures() {
    const g = this.add.graphics();

    g.fillStyle(0x263746).fillRoundedRect(0, 0, 38, 64, 8);
    g.fillStyle(0xe1c58e).fillCircle(19, 14, 10);
    g.fillStyle(0x8fc6d9).fillRect(7, 25, 24, 28);
    g.fillStyle(0xd7e6ef).fillRect(26, 31, 18, 5);
    g.generateTexture('hero', 48, 64);
    g.clear();

    g.fillStyle(0x432f39).fillRoundedRect(0, 0, 40, 58, 7);
    g.fillStyle(0xb96562).fillCircle(20, 13, 9);
    g.fillStyle(0x7b4348).fillRect(6, 24, 28, 25);
    g.fillStyle(0xf0c36a).fillTriangle(7, 23, 20, 7, 33, 23);
    g.generateTexture('enemy', 40, 58);
    g.clear();

    g.fillStyle(0x7fa46b).fillRect(0, 0, 64, 64);
    g.fillStyle(0x56754f).fillRect(0, 0, 64, 12);
    g.fillStyle(0x3f5642).fillRect(0, 12, 64, 5);
    g.generateTexture('ground', 64, 64);
    g.clear();

    g.fillStyle(0xeec86d).fillCircle(8, 8, 7);
    g.fillStyle(0xfff1a6).fillCircle(8, 8, 3);
    g.generateTexture('coin', 16, 16);
    g.clear();

    g.fillStyle(0x84d8ff).fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.score = 0;
    this.health = 5;
    this.facing = 1;
    this.attackReady = true;
    this.gameWon = false;
    this.touch = { left: false, right: false, jump: false, attack: false };

    this.physics.world.setBounds(0, 0, 2600, H);
    this.createWorld();
    this.createPlayer();
    this.createEnemies();
    this.createHUD();
    this.createControls();

    this.cameras.main.setBounds(0, 0, 2600, H);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09, -180, 45);
    this.cameras.main.setDeadzone(260, 160);

    this.keys = this.input.keyboard.addKeys('A,D,W,SPACE,J,K,R');
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  createWorld() {
    this.cameras.main.setBackgroundColor('#101a25');

    this.add.rectangle(1300, 210, 2600, 420, 0x172738).setScrollFactor(0.2);
    for (let x = 80; x < 2600; x += 180) {
      const height = Phaser.Math.Between(120, 270);
      this.add.triangle(x, FLOOR_Y - 70, 0, height, 80, 0, 160, height, 0x203344)
        .setScrollFactor(0.45).setAlpha(0.8);
    }

    this.platforms = this.physics.add.staticGroup();
    for (let x = 32; x < 2600; x += 64) this.platforms.create(x, FLOOR_Y + 32, 'ground');

    [[520, 500, 190, 24], [840, 435, 180, 24], [1220, 515, 190, 24], [1580, 450, 220, 24], [1940, 385, 190, 24]].forEach(([x,y,w,h]) => {
      const p = this.add.rectangle(x, y, w, h, 0x56754f);
      this.physics.add.existing(p, true);
      this.platforms.add(p);
    });

    this.add.text(90, 500, 'THE OLD ROAD', { fontFamily: 'Georgia, serif', fontSize: '34px', color: '#f2dfb3' })
      .setAlpha(0.85);
    this.add.text(90, 540, 'Reach the gate. Defeat anything blocking the path.', { fontSize: '16px', color: '#aebdca' });

    this.exit = this.add.rectangle(2440, 490, 90, 240, 0x34495a).setStrokeStyle(6, 0xd5b56e);
    this.physics.add.existing(this.exit, true);
    this.add.text(2440, 355, 'GATE', { fontSize: '18px', color: '#f1d995', fontStyle: 'bold' }).setOrigin(0.5);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(170, 540, 'hero');
    this.player.setDepth(5).setCollideWorldBounds(true);
    this.player.body.setSize(32, 58).setOffset(6, 6).setGravityY(1500);
    this.player.body.setMaxVelocity(340, 900);
    this.physics.add.collider(this.player, this.platforms);

    this.attackZone = this.add.zone(0, 0, 72, 60);
    this.physics.add.existing(this.attackZone);
    this.attackZone.body.setAllowGravity(false);
    this.attackZone.body.enable = false;
  }

  createEnemies() {
    this.enemies = this.physics.add.group();
    [720, 1110, 1480, 1830, 2200].forEach((x, i) => {
      const enemy = this.enemies.create(x, 548, 'enemy');
      enemy.setData({ hp: i === 4 ? 4 : 2, originX: x, direction: -1, lastHit: 0 });
      enemy.body.setGravityY(1500).setSize(34, 54).setOffset(3, 4);
    });
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.enemies, (_, enemy) => this.hurtPlayer(enemy));
    this.physics.add.overlap(this.attackZone, this.enemies, (_, enemy) => this.hitEnemy(enemy));
  }

  createHUD() {
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(50);
    const panel = this.add.rectangle(20, 18, 320, 92, 0x091019, 0.88).setOrigin(0).setStrokeStyle(2, 0x42566a);
    this.healthText = this.add.text(40, 34, '', { fontSize: '20px', color: '#f3d9ba', fontStyle: 'bold' });
    this.scoreText = this.add.text(40, 68, '', { fontSize: '16px', color: '#e9c86d' });
    this.objectiveText = this.add.text(W - 30, 28, 'OBJECTIVE: Reach the gate', { fontSize: '16px', color: '#d8e2ea', fontStyle: 'bold' }).setOrigin(1, 0);
    this.prompt = this.add.text(W / 2, 82, 'A/D move • W/Space jump • J attack', {
      fontSize: '17px', color: '#f8e5b9', backgroundColor: '#101820cc', padding: { x: 16, y: 9 }
    }).setOrigin(0.5, 0).setAlpha(0.95);
    this.hud.add([panel, this.healthText, this.scoreText, this.objectiveText, this.prompt]);
    this.refreshHUD();

    this.time.delayedCall(5200, () => this.tweens.add({ targets: this.prompt, alpha: 0, duration: 700 }));
  }

  createControls() {
    const makeButton = (x, y, label, key) => {
      const b = this.add.circle(x, y, 42, 0x0a1018, 0.55).setStrokeStyle(2, 0xd8e2ea, 0.35)
        .setScrollFactor(0).setDepth(60).setInteractive();
      const t = this.add.text(x, y, label, { fontSize: '26px', color: '#f3e5c6', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(61);
      b.on('pointerdown', () => { this.touch[key] = true; b.setAlpha(0.95); });
      b.on('pointerup', () => { this.touch[key] = false; b.setAlpha(1); });
      b.on('pointerout', () => { this.touch[key] = false; b.setAlpha(1); });
      return [b, t];
    };
    makeButton(78, H - 72, '◀', 'left');
    makeButton(176, H - 72, '▶', 'right');
    makeButton(W - 170, H - 72, '↑', 'jump');
    makeButton(W - 72, H - 72, '⚔', 'attack');
  }

  update(time) {
    if (this.gameWon) return;

    const body = this.player.body;
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.right;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)
      || this.touch.jump;
    const attackPressed = Phaser.Input.Keyboard.JustDown(this.keys.J)
      || Phaser.Input.Keyboard.JustDown(this.keys.K)
      || this.touch.attack;

    if (left === right) {
      body.setVelocityX(Phaser.Math.Linear(body.velocity.x, 0, 0.22));
    } else {
      this.facing = left ? -1 : 1;
      body.setVelocityX(this.facing * 285);
      this.player.setFlipX(this.facing < 0);
    }

    if (jumpPressed && (body.blocked.down || body.touching.down)) {
      body.setVelocityY(-610);
      this.burst(this.player.x, this.player.y + 30, 0xb9d5df, 5);
    }
    this.touch.jump = false;

    if (attackPressed && this.attackReady) this.attack();
    this.touch.attack = false;

    this.attackZone.setPosition(this.player.x + this.facing * 50, this.player.y);
    this.updateEnemies(time);

    if (this.player.y > H + 40) this.restart();
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(), this.exit.getBounds()) && this.enemies.countActive(true) === 0) {
      this.win();
    }
  }

  attack() {
    this.attackReady = false;
    this.attackZone.body.enable = true;
    this.player.setTint(0xffffff);
    this.cameras.main.shake(70, 0.002);

    const slash = this.add.arc(this.player.x + this.facing * 42, this.player.y, 42, this.facing > 0 ? 285 : 105, this.facing > 0 ? 75 : 255, false, 0xeaf7ff, 0.55)
      .setDepth(7);
    this.tweens.add({ targets: slash, alpha: 0, scale: 1.35, duration: 120, onComplete: () => slash.destroy() });
    this.time.delayedCall(95, () => { this.attackZone.body.enable = false; this.player.clearTint(); });
    this.time.delayedCall(300, () => { this.attackReady = true; });
  }

  hitEnemy(enemy) {
    const now = this.time.now;
    if (!enemy.active || now - enemy.getData('lastHit') < 220) return;
    enemy.setData('lastHit', now);
    enemy.setData('hp', enemy.getData('hp') - 1);
    enemy.setVelocity(this.facing * 360, -220);
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(90, () => enemy.active && enemy.clearTint());
    this.burst(enemy.x, enemy.y, 0xffd27a, 9);

    if (enemy.getData('hp') <= 0) {
      this.score += 100;
      this.refreshHUD();
      this.tweens.add({ targets: enemy, alpha: 0, angle: this.facing * 28, y: enemy.y - 30, duration: 260, onComplete: () => enemy.destroy() });
      if (this.enemies.countActive(true) <= 1) this.objectiveText.setText('OBJECTIVE: Enter the gate');
    }
  }

  hurtPlayer(enemy) {
    if (this.player.getData('invulnerable')) return;
    this.player.setData('invulnerable', true);
    this.health -= 1;
    this.refreshHUD();
    this.player.setVelocity(enemy.x < this.player.x ? 420 : -420, -320);
    this.player.setTintFill(0xff8b8b);
    this.cameras.main.shake(150, 0.008);
    this.time.delayedCall(900, () => { this.player.setData('invulnerable', false); this.player.clearTint(); });
    if (this.health <= 0) this.time.delayedCall(350, () => this.restart());
  }

  updateEnemies(time) {
    this.enemies.children.iterate(enemy => {
      if (!enemy?.active) return;
      const distance = this.player.x - enemy.x;
      if (Math.abs(distance) < 280) {
        enemy.setVelocityX(Math.sign(distance) * 88);
        enemy.setFlipX(distance > 0);
      } else {
        const origin = enemy.getData('originX');
        let direction = enemy.getData('direction');
        if (enemy.x < origin - 90) direction = 1;
        if (enemy.x > origin + 90) direction = -1;
        enemy.setData('direction', direction);
        enemy.setVelocityX(direction * 42);
        enemy.setFlipX(direction > 0);
      }
      enemy.y += Math.sin(time / 220 + enemy.x) * 0.08;
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

  refreshHUD() {
    this.healthText.setText(`VITALITY  ${'◆'.repeat(Math.max(0, this.health))}${'◇'.repeat(Math.max(0, 5 - this.health))}`);
    this.scoreText.setText(`RENOWN  ${String(this.score).padStart(4, '0')}`);
  }

  win() {
    this.gameWon = true;
    this.player.body.setVelocity(0, 0);
    const veil = this.add.rectangle(W / 2, H / 2, W, H, 0x081018, 0.82).setScrollFactor(0).setDepth(100);
    const title = this.add.text(W / 2, H / 2 - 54, 'ROAD CLEARED', { fontFamily: 'Georgia, serif', fontSize: '54px', color: '#f1d28c', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    const copy = this.add.text(W / 2, H / 2 + 20, `Renown earned: ${this.score}\nPress R to replay`, { align: 'center', fontSize: '21px', color: '#dbe6ec', lineSpacing: 10 }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.input.keyboard.once('keydown-R', () => this.scene.restart());
    this.tweens.add({ targets: [veil, title, copy], alpha: { from: 0, to: 1 }, duration: 600 });
  }

  restart() { this.scene.restart(); }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#101a25',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene]
});
