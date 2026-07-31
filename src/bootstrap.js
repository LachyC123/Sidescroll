import Phaser from 'phaser';

const MANIFEST_URL = `${import.meta.env.BASE_URL}game-assets/manifest.json`;
const IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg'];

function scoreAsset(asset, terms) {
  const haystack = `${asset.output_path ?? ''} ${asset.source_path ?? ''} ${asset.pack ?? ''}`.toLowerCase();
  return terms.reduce((score, term, index) => score + (haystack.includes(term) ? 20 - index : 0), 0);
}

function chooseAsset(assets, terms) {
  return assets
    .filter(asset => IMAGE_EXTENSIONS.some(ext => (asset.output_path ?? '').toLowerCase().endsWith(ext)))
    .map(asset => ({ asset, score: scoreAsset(asset, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.asset ?? null;
}

async function discoverAssets() {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json();
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

    const selected = {
      hero: chooseAsset(assets, ['knight', 'warrior', 'hero', 'player', 'character', 'idle']),
      enemy: chooseAsset(assets, ['skeleton', 'bandit', 'goblin', 'enemy', 'monster', 'orc']),
      ground: chooseAsset(assets, ['grass', 'ground', 'platform', 'tile', 'terrain']),
      coin: chooseAsset(assets, ['coin', 'gold', 'pickup', 'loot']),
      background: chooseAsset(assets, ['forest', 'background', 'mountain', 'parallax', 'sky'])
    };

    return { manifest, selected };
  } catch (error) {
    console.info('Legacy Fantasy asset pack is not installed yet; using polished fallback art.', error);
    return null;
  }
}

function assetUrl(asset) {
  if (!asset?.output_path) return null;
  const relative = asset.output_path.replace(/^build\/browser-assets\/?/, '').replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}game-assets/${relative}`;
}

function installRuntimeAssets(discovery) {
  if (!discovery) return;

  const game = Phaser.GAMES[0];
  if (!game) return;

  const tryInstall = () => {
    const scene = game.scene.getScene('GameScene');
    if (!scene?.sys?.isActive()) return false;

    const entries = Object.entries(discovery.selected)
      .map(([key, asset]) => [key, assetUrl(asset)])
      .filter(([, url]) => Boolean(url));

    if (!entries.length) return true;

    entries.forEach(([key, url]) => {
      if (!scene.textures.exists(`legacy-${key}`)) scene.load.image(`legacy-${key}`, url);
    });

    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.textures.exists('legacy-hero') && scene.player) {
        scene.player.setTexture('legacy-hero').setDisplaySize(48, 64);
      }
      if (scene.textures.exists('legacy-enemy') && scene.enemies) {
        scene.enemies.children.iterate(enemy => enemy?.active && enemy.setTexture('legacy-enemy').setDisplaySize(40, 58));
      }
      if (scene.textures.exists('legacy-ground') && scene.platforms) {
        scene.platforms.children.iterate(platform => {
          if (platform?.setTexture) platform.setTexture('legacy-ground').setDisplaySize(64, 64);
        });
      }
      if (scene.textures.exists('legacy-background')) {
        scene.add.image(1300, 360, 'legacy-background')
          .setDisplaySize(2600, 720)
          .setScrollFactor(0.15)
          .setDepth(-20)
          .setAlpha(0.7);
      }

      scene.registry.set('assetPackInstalled', true);
      scene.registry.set('assetManifest', discovery.manifest);
      console.info('Legacy Fantasy runtime assets installed.', discovery.selected);
    });

    scene.load.start();
    return true;
  };

  if (tryInstall()) return;
  const timer = window.setInterval(() => {
    if (tryInstall()) window.clearInterval(timer);
  }, 250);
  window.setTimeout(() => window.clearInterval(timer), 15000);
}

const discovery = await discoverAssets();
await import('./main.js');
installRuntimeAssets(discovery);
