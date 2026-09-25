/**
 * Dev-only art studio: renders the menu illustrations with the real game scene (World, Runner,
 * obstacles) and saves them to public/art via the Vite dev endpoint. Run with `npm run art`
 * (open /art.html while `npm run dev` is running). Output is committed as pre-rendered art.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DEFAULT_CONFIG, DEFAULT_GEAR, RunSim, type RouteId, type SkinDef, type Theme } from '@void-rush/shared';
import { EntityViews } from '../game/entities';
import { profileFor } from '../game/quality';
import { RunnerModel, type RunnerPose } from '../game/runner';
import { loadRunnerAsset } from '../game/runnerAsset';
import { glowTexture } from '../game/textures';
import { World } from '../game/world';

const log = (s: string) => {
  const el = document.getElementById('log')!;
  el.textContent += `\n${s}`;
};

const skin = (id: string): SkinDef => DEFAULT_CONFIG.skins.find((s) => s.id === id)!;

interface Shot {
  name: string;
  w: number;
  h: number;
  build(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void;
  transparent?: boolean;
  bloom?: number;
  quality?: number;
  exposure?: number;
}

function envMap(renderer: THREE.WebGLRenderer, a = 0x35d7ff, b = 0x9b5cff, c = 0xff8a1f) {
  const env = new THREE.Scene();
  const panel = (col: number, x: number, y: number, z: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(a, 0, 6, -10, 20, 4);
  panel(b, -10, 2, 0, 6, 12);
  panel(c, 10, 1, 2, 6, 10);
  panel(0xffffff, 0, 12, 4, 10, 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  return t;
}

function gradientBg(top: string, mid: string, bottom: string) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.6, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function runner(id: string, pose: RunnerPose, phase: number) {
  const r = new RunnerModel(skin(id));
  // Advance the procedural cycle to a readable stride.
  r.update(phase, pose, 30, phase);
  return r;
}

function trackScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, theme: Theme, route: RouteId, seed: number, renderZ: number, withEntities = true) {
  const world = new World(scene, theme, profileFor('high'));
  scene.environment = envMap(renderer, world.palette.accent, world.palette.accent2, world.palette.edge);
  const sim = new RunSim({ config: DEFAULT_CONFIG, routeId: route, seed, gear: DEFAULT_GEAR, revivesAllowed: 0 });
  const views = new EntityViews(scene, world.palette);
  world.update(renderZ, 0, 3, 0);
  if (withEntities) views.sync({ sim, renderZ, time: 1.3, speed: 34, tickF: 30, onTelegraph: () => undefined }, 0, 0, null);
  return { world, sim, views };
}

function chest() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x151a26, metalness: 0.85, roughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb02e, emissiveIntensity: 2.2 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x35d7ff, emissiveIntensity: 2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.8), dark);
  body.position.y = 0.75;
  g.add(body);
  for (const x of [-1.45, 1.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.55, 1.85), trim);
    band.position.set(x, 0.75, 0);
    g.add(band);
  }
  const rim = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.1, 1.85), trim);
  rim.position.y = 1.5;
  g.add(rim);
  const lid = new THREE.Group();
  lid.position.set(0, 1.5, -0.9);
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1.8), dark);
  lidMesh.position.set(0, 0.25, 0.9);
  lid.add(lidMesh);
  const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.08, 0.1), trim);
  lidTrim.position.set(0, 0.05, 1.8);
  lid.add(lidTrim);
  lid.rotation.x = -1.05;
  g.add(lid);
  const lock = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 3), cyan);
  lock.rotation.z = Math.PI;
  lock.position.set(0, 1.0, 0.92);
  g.add(lock);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc35a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 1.9, 0);
  glow.scale.set(5, 3.5, 1);
  g.add(glow);
  return g;
}

const shots: Shot[] = [
  {
    name: 'hero-home',
    w: 824,
    h: 940,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'neon', 'neon', 11, 4);
      const r = runner('void_guard', 'run', 0.21);
      r.root.position.set(0, 0, -0.6);
      r.root.scale.setScalar(1.15);
      scene.add(r.root);
      cam.fov = 56;
      cam.position.set(0.35, 1.25, 3.2);
      cam.lookAt(0, 3.6, -30);
    },
  },
  ...(['neon', 'rift', 'bridge', 'secret'] as const).map<Shot>((route, i) => ({
    name: `route-${route}`,
    w: 480,
    h: 600,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, route, route, 100 + i * 7, 8);
      const r = runner(route === 'secret' ? 'void_echo' : 'void_guard', 'run', 0.2 + i * 0.1);
      r.root.position.set(0, 0, -2);
      scene.add(r.root);
      cam.fov = 60;
      cam.position.set(0, 2.4, 5);
      cam.lookAt(0, 3, -40);
    },
  })),
  {
    name: 'season',
    w: 1000,
    h: 560,
    exposure: 0.62,
    bloom: 0.6,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'rift', 'rift', 5, 60, false);
      const r = runner('void_shadow', 'idle', 1.1);
      r.root.rotation.y = Math.PI * 0.93;
      r.root.position.set(1.6, 0, 0);
      scene.add(r.root);
      cam.fov = 30;
      cam.position.set(0.4, 1.6, 7.8);
      cam.lookAt(0.2, 1.9, 0);
    },
  },
  {
    name: 'shop-hero',
    w: 1000,
    h: 520,
    exposure: 0.7,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'rift', 'rift', 9, 20, false);
      const r = runner('shadow_warden', 'idle', 0.7);
      r.root.rotation.y = -0.35;
      r.root.position.set(1.8, 0, 0);
      scene.add(r.root);
      cam.fov = 34;
      cam.position.set(0, 1.5, 7);
      cam.lookAt(0.4, 2.1, -4);
    },
  },
  {
    name: 'event-boss',
    w: 900,
    h: 900,
    build(scene, cam, renderer) {
      const { world } = trackScene(scene, renderer, 'event', 'event', 3, 20);
      if (world.boss) {
        world.boss.position.set(0, -6, -150);
        world.boss.scale.setScalar(1.25);
      }
      const r = runner('void_guard', 'run', 0.3);
      r.root.position.set(0, 0, -3);
      scene.add(r.root);
      cam.fov = 62;
      cam.position.set(0, 1.4, 4);
      cam.lookAt(0, 16, -60);
    },
  },
  {
    name: 'results',
    w: 1000,
    h: 620,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'neon', 'neon', 21, 70, false);
      const r = runner('void_guard', 'idle', 0.4);
      r.root.rotation.y = Math.PI * 0.78;
      r.root.position.set(2.2, 0, 0);
      scene.add(r.root);
      cam.fov = 34;
      cam.position.set(0, 1.7, 8.5);
      cam.lookAt(0.6, 2.1, 0);
    },
  },
  {
    name: 'howto-swipe',
    w: 480,
    h: 300,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'neon', 'neon', 44, 2);
      const r = runner('void_guard', 'run', 0.25);
      r.root.position.set(0.3, 0, -1);
      r.lean = 0.8;
      r.update(0.2, 'run', 30, 1);
      scene.add(r.root);
      cam.fov = 55;
      cam.position.set(0, 2.2, 4.4);
      cam.lookAt(0, 1.6, -12);
    },
  },
  {
    name: 'howto-shards',
    w: 480,
    h: 300,
    build(scene, cam, renderer) {
      const { views } = trackScene(scene, renderer, 'neon', 'tutorial', 1, 0);
      void views;
      const shardMat = new THREE.MeshStandardMaterial({ color: 0xb98cff, emissive: 0x8a4dff, emissiveIntensity: 1.8, flatShading: true });
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0).scale(0.8, 1.55, 0.8), shardMat);
        s.position.set(0.4 + i * 0.25, 1, -3 - i * 2.4);
        s.rotation.y = i;
        scene.add(s);
      }
      const r = runner('void_guard', 'run', 0.6);
      r.root.position.set(-0.6, 0, -1);
      scene.add(r.root);
      cam.fov = 52;
      cam.position.set(-0.4, 2, 4);
      cam.lookAt(0.4, 1.4, -12);
    },
  },
  {
    name: 'howto-finish',
    w: 480,
    h: 300,
    build(scene, cam, renderer) {
      trackScene(scene, renderer, 'neon', 'tutorial', 2, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 10, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35d7ff).multiplyScalar(2.5) }));
      ring.position.set(0, 3, -9);
      scene.add(ring);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9b5cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      inner.position.copy(ring.position);
      scene.add(inner);
      const c = chest();
      c.scale.setScalar(0.6);
      c.position.set(1.4, 0, -4);
      c.rotation.y = -0.5;
      scene.add(c);
      const r = runner('void_guard', 'run', 0.3);
      r.root.position.set(-1.2, 0, -2.5);
      scene.add(r.root);
      cam.fov = 52;
      cam.position.set(0, 2, 4);
      cam.lookAt(0, 2, -10);
    },
  },
  {
    name: 'chest',
    w: 600,
    h: 400,
    transparent: true,
    bloom: 0.6,
    build(scene, cam, renderer) {
      scene.environment = envMap(renderer);
      scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x120a24, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2);
      key.position.set(3, 5, 6);
      scene.add(key);
      const c = chest();
      c.rotation.y = -0.25;
      scene.add(c);
      cam.fov = 30;
      cam.position.set(0, 3.6, 8);
      cam.lookAt(0, 1.1, 0);
    },
  },
  ...DEFAULT_CONFIG.skins.map<Shot>((s) => ({
    name: `skin-${s.id}`,
    w: 400,
    h: 560,
    bloom: 0.55,
    build(scene, cam, renderer) {
      scene.environment = envMap(renderer, 0x35d7ff, 0x9b5cff, new THREE.Color(s.colors.trim).getHex());
      scene.background = gradientBg('#060a1c', '#0b1230', s.colors.trim);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: s.colors.trim, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.set(0, 1.2, -1.2);
      halo.scale.set(3.4, 3.4, 1);
      scene.add(halo);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.02, 8, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(s.colors.trim).multiplyScalar(2) }));
      scene.add(ring);
      scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x120a24, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2, 4, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(new THREE.Color(s.colors.trim), 3);
      rim.position.set(-3, 3, -4);
      scene.add(rim);
      const r = runner(s.id, 'idle', 0.9);
      r.root.rotation.y = Math.PI + 0.45;
      scene.add(r.root);
      cam.fov = 26;
      cam.position.set(0, 1.25, 5.6);
      cam.lookAt(0, 1.08, 0);
    },
  })),
  ...DEFAULT_CONFIG.skins.map<Shot>((s) => ({
    name: `avatar-${s.id}`,
    w: 192,
    h: 192,
    bloom: 0.4,
    build(scene, cam, renderer) {
      scene.environment = envMap(renderer, 0x35d7ff, 0x9b5cff, new THREE.Color(s.colors.trim).getHex());
      scene.background = gradientBg('#0b1230', '#1a1a40', s.colors.trim);
      scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x120a24, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(2, 4, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(new THREE.Color(s.colors.trim), 4);
      rim.position.set(-3, 3, -4);
      scene.add(rim);
      const r = runner(s.id, 'idle', 0.2);
      r.root.rotation.y = Math.PI + 0.35;
      scene.add(r.root);
      cam.fov = 22;
      cam.position.set(0, 1.92, 2.6);
      cam.lookAt(0, 1.86, 0);
    },
  })),
];

async function render(shot: Shot) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: Boolean(shot.transparent), preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(shot.w, shot.h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = shot.exposure ?? 0.95;
  if (shot.transparent) renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, shot.w / shot.h, 0.1, 900);
  shot.build(scene, cam, renderer);
  cam.aspect = shot.w / shot.h;
  cam.updateProjectionMatrix();
  if (shot.transparent) {
    // Bloom would flatten the alpha channel; transparent shots rely on emissive colour only.
    renderer.render(scene, cam);
  } else {
    const composer = new EffectComposer(renderer);
    composer.setSize(shot.w, shot.h);
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(shot.w, shot.h), shot.bloom ?? 0.75, 0.45, 0.9));
    composer.addPass(new OutputPass());
    composer.render();
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', shot.quality ?? 0.84));
  if (!blob) throw new Error(`encode failed: ${shot.name}`);
  const res = await fetch(`/__art/save?name=${shot.name}.webp`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  renderer.dispose();
  renderer.forceContextLoss();
  log(`✓ ${shot.name}.webp (${Math.round(blob.size / 1024)} KB)`);
}

async function main() {
  await loadRunnerAsset();
  const only = new URLSearchParams(location.search).get('only');
  for (const s of shots) {
    if (only && !s.name.startsWith(only)) continue;
    try {
      await render(s);
    } catch (err) {
      log(`✗ ${s.name}: ${(err as Error).message}`);
    }
  }
  log('done');
  (window as unknown as { artDone: boolean }).artDone = true;
}

void main();
