import * as THREE from 'three';
import type { SkinDef } from '@void-rush/shared';
import { RunnerModel } from './runner';
import { glowTexture } from './textures';

/** Lightweight real-time Runner viewer for Gear / Skin preview: runner + portal backdrop only. */
export class RunnerViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly runner: RunnerModel;
  private readonly ring: THREE.Mesh;
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

    this.scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x120a24, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9b5cff, 3);
    rim.position.set(-3, 3, -4);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0x35d7ff, 2);
    rim2.position.set(3, 1, -3);
    this.scene.add(rim2);
    const env = new THREE.Scene();
    const panel = (c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(0x35d7ff, 0, 4, -6);
    panel(0x9b5cff, -6, 1, 0);
    panel(0xff8a1f, 6, 1, 1);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();

    this.runner = new RunnerModel(skin);
    this.scene.add(this.runner.root);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.03, 8, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35d7ff).multiplyScalar(2) }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.scene.add(this.ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x2a7bff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.position.y = 0.01;
    this.scene.add(disc);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6a4dff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.set(0, 1.3, -1.5);
    halo.scale.set(4.5, 4.5, 1);
    this.scene.add(halo);

    this.camera.position.set(0, 1.35, 6.2);
    this.camera.lookAt(0, 1.05, 0);

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
    (this.ring.material as THREE.MeshBasicMaterial).color.set(skin.colors.trim).multiplyScalar(2);
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
    this.ring.scale.setScalar(1 + Math.sin(this.time * 2) * 0.03);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.host.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    this.runner.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
