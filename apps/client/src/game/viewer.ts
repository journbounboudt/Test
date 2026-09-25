import * as THREE from 'three';
import type { SkinDef } from '@void-rush/shared';
import { RunnerModel } from './runner';
import { glowTexture } from './textures';

const RING_BLUE = new THREE.Color(0x35d7ff);

/** Pedestal ring textures: a soft-edged band, or a band of dashes for the rotating ring. */
function pedestalTexture(kind: 'solid' | 'ticks') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 16);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  if (kind === 'solid') ctx.fillRect(0, 0, 256, 16);
  else for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, x % 64 === 0 ? 12 : 5, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Flat ring with u running around the circle (repeated `wraps` times) and v across the band. */
function bandRing(inner: number, outer: number, wraps = 1, segs = 128) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    pos.push(c * inner, sn * inner, 0, c * outer, sn * outer, 0);
    uv.push((i / segs) * wraps, 0, (i / segs) * wraps, 1);
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Lightweight real-time Runner viewer for Gear / Skin preview: runner + portal backdrop only. */
export class RunnerViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly runner: RunnerModel;
  private readonly ring: THREE.Mesh;
  private readonly ring2: THREE.Mesh;
  private readonly ticks: THREE.Mesh;
  private readonly pool: THREE.Mesh;
  private readonly underGlow: THREE.PointLight;
  private readonly props: THREE.Mesh[] = [];
  private readonly host: HTMLElement;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;
  private yaw = 0.35;
  private vel = 0;
  private dragging: { x: number } | null = null;
  private idleSince = 0;

  constructor(host: HTMLElement, skin: SkinDef) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'viewer-canvas';
    host.appendChild(this.renderer.domElement);

    // Hero lighting: warm key, cool fill, strong violet/cyan rims that outline the armour.
    this.scene.add(new THREE.HemisphereLight(0x8fa4ff, 0x0c0818, 0.7));
    const key = new THREE.DirectionalLight(0xfff1e6, 2.4);
    key.position.set(2.2, 3.6, 4.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f8cff, 0.7);
    fill.position.set(-3, 1.2, 3);
    this.scene.add(fill);
    const rimL = new THREE.DirectionalLight(0xa066ff, 4.2);
    rimL.position.set(-3.2, 2.6, -3.5);
    this.scene.add(rimL);
    const rimR = new THREE.DirectionalLight(0x3ad8ff, 3.4);
    rimR.position.set(3.2, 2.0, -3.2);
    this.scene.add(rimR);
    this.underGlow = new THREE.PointLight(0x2f7bff, 2.2, 4, 1.6);
    this.underGlow.position.set(0, 0.25, 0.6);
    this.scene.add(this.underGlow);
    const env = new THREE.Scene();
    const panel = (c: number, k: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(0x35d7ff, 2.2, 0, 5, -6, 10, 3);
    panel(0x9b5cff, 1.8, -6, 1.5, -1, 4, 9);
    panel(0x3ad8ff, 1.5, 6, 1.5, -1, 4, 9);
    panel(0xffffff, 1.6, 0, 7, 4, 8, 2);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.035).texture;
    pm.dispose();

    this.runner = new RunnerModel(skin);
    this.runner.glow = 0.6;
    this.scene.add(this.runner.root);

    // Pedestal: soft glow pool, bright rim ring, thin outer ring with rotating ticks.
    const add = (m: THREE.Mesh, y: number) => {
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = -1;
      this.scene.add(m);
      this.props.push(m);
      return m;
    };
    const glowMat = (color: number, opacity: number, map: THREE.Texture = glowTexture()) =>
      new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pool = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), glowMat(0x2a6bff, 0.75)), 0.005);
    this.ring = add(new THREE.Mesh(bandRing(0.7, 0.78), glowMat(0x35d7ff, 1, pedestalTexture('solid'))), 0.012);
    this.ring2 = add(new THREE.Mesh(bandRing(0.97, 1.01), glowMat(0x35d7ff, 0.55, pedestalTexture('solid'))), 0.01);
    this.ticks = add(new THREE.Mesh(bandRing(0.84, 0.9, 4), glowMat(0x35d7ff, 0.8, pedestalTexture('ticks'))), 0.011);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5a3dff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.set(0, 1.25, -1.6);
    halo.scale.set(4.2, 4.6, 1);
    this.scene.add(halo);

    // Slightly low camera for a heroic read, framed on the whole body.
    this.camera.position.set(0, 1.05, 6.3);
    this.camera.lookAt(0, 0.98, 0);

    host.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private down = (e: PointerEvent) => {
    this.dragging = { x: e.clientX };
    this.vel = 0;
  };
  private move = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragging.x;
    this.dragging.x = e.clientX;
    this.yaw += dx * 0.012;
    this.vel = dx * 0.012;
    this.idleSince = this.time;
  };
  private up = () => {
    this.dragging = null;
  };

  setSkin(skin: SkinDef) {
    this.runner.setSkin(skin);
    const accent = new THREE.Color(skin.colors.trail);
    (this.ring.material as THREE.MeshBasicMaterial).color.copy(accent).multiplyScalar(1.6);
    (this.ticks.material as THREE.MeshBasicMaterial).color.copy(accent);
    (this.ring2.material as THREE.MeshBasicMaterial).color.copy(accent).lerp(RING_BLUE, 0.6);
    this.underGlow.color.copy(accent).lerp(RING_BLUE, 0.5);
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (now < this.last) this.last = now;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (!this.dragging) {
      this.vel *= 0.92;
      this.yaw += this.vel;
      if (this.time - this.idleSince > 2.5) this.yaw += dt * 0.35;
    }
    this.runner.root.rotation.y = this.yaw + Math.PI;
    this.runner.update(dt, 'idle', 0, this.time);
    this.ring.scale.setScalar(1 + Math.sin(this.time * 2) * 0.015);
    this.ticks.rotation.z = this.time * 0.35;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(this.time * 1.6) * 0.08;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.host.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    this.runner.dispose();
    for (const m of this.props) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map && mat.map !== glowTexture()) mat.map.dispose();
      mat.dispose();
    }
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
