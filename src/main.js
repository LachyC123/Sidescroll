import Phaser from 'phaser';
import './styles.css';

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.scene.start('PrototypeScene');
  }
}

class PrototypeScene extends Phaser.Scene {
  constructor() {
    super('PrototypeScene');
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#111821');

    this.add.rectangle(width / 2, height - 56, width, 112, 0x1b2733);
    this.add.rectangle(width / 2, height - 112, width, 4, 0x35485a);

    this.player = this.add.rectangle(160, height - 160, 38, 68, 0xd8c48c);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setGravityY(1400);

    this.ground = this.add.rectangle(width / 2, height - 56, width, 112, 0x1b2733);
    this.physics.add.existing(this.ground, true);
    this.physics.add.collider(this.player, this.ground);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('A,D,W,SPACE');

    this.title = this.add.text(24, 22, 'LEGACY FANTASY — BROWSER FOUNDATION', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#f3e8c8',
      fontStyle: 'bold'
    });

    this.add.text(24, 50, 'Move: A/D or arrows   Jump: W/Up/Space', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#9eb0bf'
    });

    this.add.text(width / 2, height / 2 - 40, 'Asset integration begins after the ZIP audit.', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#d7dde2'
    }).setOrigin(0.5);
  }

  update() {
    const body = this.player.body;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.keys.W)
      || Phaser.Input.Keyboard.JustDown(this.keys.SPACE);

    if (left === right) {
      body.setVelocityX(0);
    } else {
      body.setVelocityX(left ? -260 : 260);
    }

    if (jump && body.blocked.down) {
      body.setVelocityY(-560);
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#111821',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, PrototypeScene]
};

new Phaser.Game(config);
