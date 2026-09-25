import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RunSim, TICK_RATE, type BoostId, type GearLevels, type InputRecord, type RemoteConfig, type RouteId, type RunAction, type RunSummary, type SkinDef } from '@void-rush/shared';
import { audio } from '../audio/audio';
import { tg } from '../platform/telegram';
import { EntityViews } from './entities';
import { detectTier, profileFor, rememberTier, type QualityProfile, type Tier } from './quality';
import { RunnerModel, type RunnerPose } from './runner';
import { glowTexture } from './textures';
import { SpeedPass } from './postfx';
import { Fields, Particles, Shockwaves, Trail } from './vfx';
import { LANE_W, World } from './world';

const STEP = 1 / TICK_RATE;

export interface HudState {
  phase: RunSim['phase'] | 'countdown';
  distance: number;
  score: number;
  time: number;
  combo: number;
  mult: number;
  shards: number;
  shieldCharges: number;
  shieldActive: number;
  magnetCharges: number;
  magnetActive: number;
  ult: number;
  ultActive: number;
  boostShields: number;
  speedBoost: boolean;
  invulnerable: boolean;
  progress: number;
  checkpoints: number[];
  climax: number | null;
  climaxActive: boolean;
  pad: boolean;
  gain: number;
}

export type EngineEvent =
  | { type: 'countdown'; n: number }
  | { type: 'checkpoint'; index: number; options: BoostId[] }
  | { type: 'down' }
  | { type: 'done'; summary: RunSummary; inputs: InputRecord[] }
  | { type: 'popup'; text: string; kind: 'near' | 'combo' | 'shield' | 'boost' | 'smash' | 'soft' | 'ult' | 'shard' }
  | { type: 'hint'; hint: string }
  | { type: 'flash'; kind: 'hit' | 'soft' | 'revive' | 'ult' | 'finish' | 'shield' | 'pad' }
  | { type: 'climax'; name: string }
  | { type: 'autopause' };

export interface EngineOptions {
  config: RemoteConfig;
  routeId: RouteId;
  seed: number;
  gear: GearLevels;
  skin: SkinDef;
  graphics: 'auto' | Tier;
  reducedShake: boolean;
  reducedFlash?: boolean;
  onHud(h: HudState): void;
  onEvent(e: EngineEvent): void;
}

export class GameEngine {
  readonly sim: RunSim;
  private readonly opts: EngineOptions;
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly world: World;
  private readonly runner: RunnerModel;
  private readonly views: EntityViews;
  private readonly particles: Particles;
  private readonly trail: Trail;
  private readonly fields: Fields;
  private readonly waves: Shockwaves;
  private speedPass: SpeedPass | null = null;
  private timeScale = 1;
  private slowmo = 0;
  private padFx = 0;
  private readonly finishPortal = new THREE.Group();
  private q: QualityProfile;
  private readonly ro: ResizeObserver;

  private raf = 0;
  private last = 0;
  private time = 0;
  private acc = 0;
  private mode: 'countdown' | 'run' | 'ended' = 'countdown';
  private countdown = 3.2;
  private lastCount = 4;
  private paused = false;
  private hitStop = 0;
  private shake = 0;
  private camX = 0;
  private camH = 3.25;
  private camD = 6.4;
  private prevZ = 0;
  private prevLane = 1;
  private renderZ = 0;
  private hudAt = 0;
  private readonly pending: RunAction[] = [];
  readonly inputs: InputRecord[] = [];
  private frameTimes: number[] = [];
  private checkedPerf = false;
  private downgrades = 0;
  private disposed = false;
  private touch: { x: number; y: number; id: number; fired: number } | null = null;
  private readonly tmpV = new THREE.Vector3();

  constructor(host: HTMLElement, opts: EngineOptions) {
    this.host = host;
    this.opts = opts;
    this.q = profileFor(detectTier(opts.graphics));
    this.sim = new RunSim({ config: opts.config, routeId: opts.routeId, seed: opts.seed, gear: opts.gear, revivesAllowed: 1, emitEvents: true });
    this.prevZ = this.sim.z;

    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.antialias, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.setPixelRatio(this.q.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 800);
    this.camera.position.set(0, 3.3, 6.4);

    const route = opts.config.routes[opts.routeId];
    this.world = new World(this.scene, route.theme, this.q);
    this.scene.environment = this.buildEnvironment();
    this.runner = new RunnerModel(opts.skin);
    this.scene.add(this.runner.root);
    this.views = new EntityViews(this.scene, this.world.palette);
    this.particles = new Particles(this.q.particles);
    this.scene.add(this.particles.points);
    this.trail = new Trail(opts.skin.colors.trail);
    this.scene.add(this.trail.mesh);
    this.fields = new Fields(this.world.palette.accent, this.world.palette.accent2);
    this.scene.add(this.fields.group);
    this.waves = new Shockwaves(12);
    this.scene.add(this.waves.group);
    this.views.camera = this.camera;
    this.buildFinishPortal();
    this.setupPost();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindInput();
    this.warmup();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Colourful studio for PMREM so dark metals pick up neon reflections. */
  private buildEnvironment() {
    const env = new THREE.Scene();
    const P = this.world.palette;
    env.background = new THREE.Color(0x05060c);
    const panel = (color: number, intensity: number, x: number, y: number, z: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(P.accent, 1.4, 0, 6, -10, 20, 4);
    panel(P.accent2, 1.4, -10, 2, 0, 6, 12);
    panel(P.edge, 1.2, 10, 1, 2, 6, 10);
    panel(0xffffff, 0.8, 0, 12, 4, 10, 3);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const tex = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    return tex;
  }

  private buildFinishPortal() {
    const P = this.world.palette;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.35, 10, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent).multiplyScalar(2.5) }));
    ring.position.y = 3.2;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 48),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(P.accent2).multiplyScalar(1.4), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    inner.position.y = 3.2;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: P.accent, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 3.2;
    halo.scale.set(18, 18, 1);
    this.finishPortal.add(ring, inner, halo);
    this.finishPortal.visible = false;
    this.scene.add(this.finishPortal);
  }

  private setupPost() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.speedPass = null;
    if (!this.q.bloom) return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.q.tier === 'high' ? 0.8 : 0.65, 0.5, 0.72);
    composer.addPass(this.bloom);
    this.speedPass = new SpeedPass(this.q.tier === 'high' ? 10 : 6);
    composer.addPass(this.speedPass.asPass);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(this.q.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the three lanes framed on narrow portrait phones.
    this.camera.fov = w / h < 0.5 ? 68 : 62;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.q.pixelRatio);
      this.composer.setSize(w, h);
      this.bloom?.setSize((w * this.q.pixelRatio) / 2, (h * this.q.pixelRatio) / 2);
    }
  }

  /** Compile every pooled material up-front so no shader compiles happen mid-run. */
  private warmup() {
    this.views.group.traverse((o) => (o.visible = true));
    this.renderer.compile(this.scene, this.camera);
    this.views.group.children.forEach((c) => {
      if (!(c instanceof THREE.InstancedMesh)) c.visible = false;
    });
    this.renderOnce(0);
  }

  private bindInput() {
    const el = this.host;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.touch = { x: e.clientX, y: e.clientY, id: e.pointerId, fired: 0 };
  };

  private onPointerMove = (e: PointerEvent) => {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    const threshold = Math.max(16, this.host.clientWidth * 0.04);
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.1 && t.fired < 2) {
      this.queue(dx < 0 ? 'L' : 'R');
      t.x = e.clientX;
      t.y = e.clientY;
      t.fired++;
    }
  };

  private onPointerUp = () => {
    this.touch = null;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.queue('L');
    else if (k === 'arrowright' || k === 'd') this.queue('R');
    else if (k === ' ' || k === 'arrowup' || k === 'w') this.queue('ult');
    else if (k === 'q' || k === '1') this.queue('shield');
    else if (k === 'e' || k === '3') this.queue('magnet');
    else return;
    e.preventDefault();
  };

  private onVisibility = () => {
    if (document.hidden && this.mode === 'run' && !this.paused && !this.sim.frozen) this.opts.onEvent({ type: 'autopause' });
  };

  /** UI → sim. Actions are stamped with the tick they are applied on. */
  queue(a: RunAction) {
    if (this.mode !== 'run' || this.paused || this.sim.done) return;
    if ((a === 'L' || a === 'R') && this.sim.phase !== 'run') return;
    this.pending.push(a);
  }

  start() {
    this.last = 0;
    audio.play('run');
    audio.intensity = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.last = 0;
    this.acc = 0;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // rAF timestamps and performance.now() may use different origins; never trust a negative delta.
    if (this.last === 0 || now < this.last) this.last = now;
    const rawDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.paused) return;
    this.trackPerf(rawDt);

    // Brief slow-motion on near misses / shield blocks. The sim stays tick-exact, so replays are unaffected.
    if (this.slowmo > 0) {
      this.slowmo -= rawDt;
      this.timeScale += (0.45 - this.timeScale) * Math.min(1, rawDt * 25);
    } else this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 8);
    let visualScale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      visualScale = 0.02;
      if (this.hitStop <= 0) this.opts.onEvent({ type: 'down' });
    } else if (this.mode === 'countdown') {
      this.countdown -= rawDt;
      const n = Math.ceil(this.countdown - 0.2);
      if (n !== this.lastCount && n >= 0) {
        this.lastCount = n;
        this.opts.onEvent({ type: 'countdown', n });
        audio.sfx(n === 0 ? 'go' : 'countdown');
      }
      if (this.countdown <= 0.2) this.mode = 'run';
    } else if (this.mode === 'run') {
      this.stepSim(rawDt * this.timeScale);
      visualScale = this.timeScale;
      if (this.sim.phase === 'checkpoint') visualScale = 0.12;
      else if (this.sim.phase === 'down') visualScale = 0.25;
    }
    const dt = rawDt * visualScale;
    this.time += dt;

    const alpha = this.sim.frozen || this.mode !== 'run' ? 1 : Math.min(1, this.acc / STEP);
    const lastRenderZ = this.renderZ;
    this.renderZ = this.prevZ + (this.sim.z - this.prevZ) * alpha;
    const lane = this.prevLane + (this.sim.laneX - this.prevLane) * alpha;
    this.renderScene(dt, this.renderZ - lastRenderZ, lane);

    if (now - this.hudAt > 80) {
      this.hudAt = now;
      this.opts.onHud(this.hud());
    }
  };

  private stepSim(dt: number) {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      if (this.sim.done || this.hitStop > 0) {
        this.acc = 0;
        break;
      }
      if (this.sim.frozen && this.pending.length === 0) {
        this.acc = 0;
        this.prevZ = this.sim.z;
        this.prevLane = this.sim.laneX;
        break;
      }
      const acts = this.pending.splice(0);
      for (const a of acts) this.inputs.push([this.sim.tick, a]);
      this.prevZ = this.sim.z;
      this.prevLane = this.sim.laneX;
      this.sim.step(acts);
      this.acc -= STEP;
      steps++;
      this.handleEvents();
    }
    audio.intensity = this.sim.timeLeft < 15 ? 1 : this.sim.timeLeft < 30 ? 0.4 : 0;
  }

  private emitPopup(text: string, kind: Extract<EngineEvent, { type: 'popup' }>['kind']) {
    this.opts.onEvent({ type: 'popup', text, kind });
  }

  private comboMilestone = 0;
  private static readonly MILESTONES: [number, string][] = [
    [25, 'В ПОТОКЕ!'],
    [50, 'ОГОНЬ!'],
    [100, 'НЕУДЕРЖИМ!'],
    [150, 'ЛЕГЕНДА ПУСТОТЫ!'],
    [250, 'БОГ СКОРОСТИ!'],
  ];

  private handleEvents() {
    const P = this.world.palette;
    const next = GameEngine.MILESTONES[this.comboMilestone];
    if (next && this.sim.combo >= next[0]) {
      this.comboMilestone++;
      this.emitPopup(next[1], 'combo');
      this.waves.spawn((this.sim.laneX - 1) * LANE_W, 1.2, 0, 0xffc35a, 3.5, 0.5);
      audio.sfx('combo', 12);
      tg.haptic('medium');
    } else if (this.comboMilestone > 0 && this.sim.combo < GameEngine.MILESTONES[this.comboMilestone - 1][0] * 0.5) {
      this.comboMilestone = Math.max(0, this.comboMilestone - 1);
    }
    const rz = this.sim.z;
    const runnerX = (this.sim.laneX - 1) * LANE_W;
    for (const ev of this.sim.events) {
      switch (ev.type) {
        case 'pad':
          this.padFx = 1;
          this.speedPass?.kick('pad');
          this.waves.spawn(runnerX, 0.05, 0, 0x35d7ff, 3.2, 0.45, true);
          this.particles.emit(runnerX, 0.2, -0.5, 18, 0x7fe6ff, { speed: 5, life: 0.4, size: 0.3, gravity: 0, vz: 10, anchored: false });
          this.emitPopup('УСКОРЕНИЕ!', 'boost');
          audio.sfx('pad');
          tg.haptic('light');
          break;
        case 'climax':
          this.world.spawnBoss();
          this.opts.onEvent({ type: 'climax', name: ev.name });
          audio.sfx('alarm');
          tg.haptic('warning');
          this.shake = Math.max(this.shake, 0.4);
          break;
        case 'pickup': {
          if (ev.kind === 'pad') break;
          const color = ev.kind === 'shard' ? 0xb07bff : ev.kind === 'credit' ? 0xffc53d : ev.kind === 'charge' ? 0x35d7ff : 0xff4d6d;
          const p = this.views.worldPos(ev, rz, this.tmpV);
          this.particles.emit(p.x, p.y, p.z, ev.kind === 'shard' ? 7 : 16, color, { speed: 3.5, life: 0.4, size: 0.3, gravity: 2 });
          if (ev.kind !== 'shard') this.waves.spawn(p.x, p.y, p.z, color, 1.6, 0.35, false, true);
          this.views.addFlying(ev.kind as 'shard', ev.lane, ev.z, rz);
          audio.sfx('pickup');
          if (ev.kind === 'charge') this.emitPopup('+ЗАРЯД', 'ult');
          if (ev.kind === 'credit') this.emitPopup('+КРЕДИТЫ', 'shard');
          break;
        }
        case 'near':
          this.emitPopup('ВПРИТЫК!', 'near');
          this.slowmo = 0.16;
          this.waves.spawn(runnerX, 1.1, -0.2, P.accent, 2.2, 0.35);
          this.particles.emit(runnerX, 1.2, -0.5, 12, P.accent, { speed: 5, life: 0.35, size: 0.25, gravity: 0, anchored: false });
          audio.sfx('near');
          tg.haptic('light');
          break;
        case 'soft':
          this.shake = Math.max(this.shake, 0.35);
          this.opts.onEvent({ type: 'flash', kind: 'soft' });
          this.emitPopup('КОМБО ↓', 'soft');
          this.particles.emit(runnerX, 0.8, -1, 16, 0xff8a4a, { speed: 4, life: 0.5, size: 0.3 });
          audio.sfx('soft');
          tg.haptic('medium');
          break;
        case 'hard':
          this.shake = 1;
          this.hitStop = 0.32;
          this.speedPass?.kick('hit');
          this.waves.spawn(runnerX, 1, -0.5, P.danger, 5, 0.6);
          this.opts.onEvent({ type: 'flash', kind: 'hit' });
          this.particles.emit(runnerX, 1, -1, 40, P.danger, { speed: 7, life: 0.8, size: 0.4 });
          audio.sfx('hit');
          tg.haptic('heavy');
          break;
        case 'block':
          if (ev.by !== 'invuln') {
            this.opts.onEvent({ type: 'flash', kind: 'shield' });
            this.emitPopup('ЩИТ!', 'shield');
            this.fields.shieldHit();
            this.speedPass?.kick('shield');
            this.slowmo = 0.2;
            this.waves.spawn(runnerX, 1.1, -0.3, 0x4cc9ff, 4, 0.5);
            this.waves.spawn(runnerX, 0.05, 0, 0x4cc9ff, 3.5, 0.55, true);
            this.particles.emit(runnerX, 1.2, -1, 30, 0x4cc9ff, { speed: 6, life: 0.6, size: 0.35 });
            audio.sfx('break');
            this.shake = Math.max(this.shake, 0.3);
            tg.haptic('medium');
          }
          break;
        case 'smash':
          this.particles.emit(runnerX, 1, -2, 30, 0xff9a1f, { speed: 9, life: 0.6, size: 0.45 });
          this.waves.spawn(runnerX, 1, -2, 0xffa32a, 2.8, 0.35, false, true);
          this.shake = Math.max(this.shake, 0.25);
          audio.sfx('break');
          break;
        case 'lane':
          audio.sfx('swipe');
          tg.haptic('select');
          break;
        case 'checkpoint':
          this.waves.spawn(0, 2.1, -1, P.accent, 7, 0.7);
          audio.sfx('checkpoint');
          tg.haptic('medium');
          this.opts.onEvent({ type: 'checkpoint', index: ev.index, options: ev.options });
          break;
        case 'boost':
          this.emitPopup(this.opts.config.boosts[ev.id].name.toUpperCase(), 'boost');
          audio.sfx('upgrade');
          break;
        case 'gadget':
          if (ev.gadget === 'ult') {
            this.speedPass?.kick('ult');
            this.waves.spawn(runnerX, 1.2, -0.5, 0xffa32a, 7, 0.6);
            this.waves.spawn(runnerX, 0.05, 0, 0xffc35a, 6, 0.6, true);
            this.particles.emitRing(runnerX, 1.1, 0, 3, 40, 0xffc35a, -9, 0.4);
            this.opts.onEvent({ type: 'flash', kind: 'ult' });
            this.emitPopup('ПРОРЫВ ВОЙДА!', 'ult');
            this.shake = Math.max(this.shake, 0.5);
            audio.sfx('ult');
            tg.haptic('heavy');
          } else {
            this.waves.spawn(runnerX, 1.1, 0, ev.gadget === 'shield' ? 0x4cc9ff : 0xc07bff, 2.6, 0.45);
            audio.sfx(ev.gadget === 'shield' ? 'shield' : 'magnet');
            tg.haptic('light');
          }
          break;
        case 'ultReady':
          this.emitPopup('ПРОРЫВ ГОТОВ', 'ult');
          tg.haptic('success');
          break;
        case 'combo':
          if (ev.mult > 1) {
            this.emitPopup(`МНОЖИТЕЛЬ x${ev.mult}`, 'combo');
            audio.sfx('combo', ev.mult);
          }
          break;
        case 'hint':
          this.opts.onEvent({ type: 'hint', hint: ev.hint });
          break;
        case 'revive':
          this.waves.spawn(runnerX, 1.1, 0, P.accent, 5, 0.6);
          this.opts.onEvent({ type: 'flash', kind: 'revive' });
          this.particles.emit(runnerX, 1.2, 0, 40, P.accent, { speed: 5, life: 0.8, size: 0.4 });
          this.hitStop = 0;
          break;
        case 'finishStart':
          this.emitPopup('ФИНИШ!', 'ult');
          this.finishPortal.visible = true;
          this.speedPass?.kick('finish');
          this.world.hideBoss();
          this.opts.onEvent({ type: 'flash', kind: 'finish' });
          audio.sfx('finish');
          tg.haptic('success');
          break;
        case 'done':
          this.mode = 'ended';
          this.opts.onEvent({ type: 'done', summary: this.sim.summary(), inputs: this.inputs.slice() });
          break;
      }
    }
    this.sim.events.length = 0;
  }

  private renderScene(dt: number, dz: number, lane: number) {
    const sim = this.sim;
    const runnerX = (lane - 1) * LANE_W;
    const ultActive = sim.ultActive;
    const speedFactor = Math.min(1, Math.max(0, (sim.speed - 24) / 34));

    this.world.update(this.renderZ, dt, this.time, ultActive ? 1 : 0);
    const pose: RunnerPose = this.mode === 'countdown' ? 'idle' : sim.phase === 'down' ? 'down' : sim.phase === 'finishing' ? 'finish' : ultActive ? 'ult' : 'run';
    this.runner.root.position.x = runnerX;
    this.runner.lean = THREE.MathUtils.clamp(sim.laneTarget - sim.laneX, -1, 1);
    this.runner.update(dt, pose, sim.speed, this.time);
    const invuln = sim.tick < sim.invulnUntil && sim.phase === 'run';
    this.runner.setOpacity(invuln && Math.sin(this.time * 30) > 0 ? 0.45 : 1);

    this.views.sync({ sim, renderZ: this.renderZ, time: this.time, speed: sim.speed, tickF: sim.tick, onTelegraph: () => audio.sfx('telegraph') }, runnerX, dt, sim.phase === 'finishing' ? sim.z : null);

    if (this.mode === 'run' && dt > 0 && (sim.phase === 'run' || sim.phase === 'finishing')) {
      const trailColor = new THREE.Color(this.opts.skin.colors.trail).getHex();
      if (Math.random() < (ultActive ? 1 : 0.5)) this.particles.emit(runnerX + (Math.random() - 0.5) * 0.3, 0.25, 0.3, ultActive ? 3 : 1, trailColor, { speed: 1, life: 0.35, size: ultActive ? 0.5 : 0.28, gravity: -1, vz: 6 });
    }
    this.particles.update(dt, dz);
    this.waves.update(dt, dz);
    this.padFx = Math.max(0, this.padFx - dt * 1.2);
    if ((sim.magnetActive || ultActive) && dt > 0 && Math.random() < 0.7) this.particles.emitRing(runnerX, 1.1, -0.5, 2.4, 2, ultActive ? 0xffc35a : 0xc07bff, 7, 0.3);
    this.world.updateBoss(this.time, dt, sim, this.renderZ);
    this.trail.mesh.visible = this.mode === 'run' && sim.phase !== 'down';
    this.trail.update(this.renderZ, runnerX, ultActive ? 0.34 : 0.12, 0.12);
    this.fields.update(dt, this.time, {
      shield: sim.shieldActive ? 1 : 0,
      boostShield: sim.boostShields > 0,
      magnet: sim.magnetActive || ultActive,
      speedFx: ultActive ? 1 : sim.tick < sim.speedBoostUntil || sim.tick < sim.padUntil ? 0.7 : speedFactor * 0.4,
      ult: ultActive ? 1 : 0,
      runnerX,
      dz,
      pad: sim.tick < sim.padUntil ? 1 : this.padFx,
    });
    this.speedPass?.update(dt || 0.016, this.time, {
      speed: speedFactor,
      ult: ultActive ? 1 : 0,
      boost: sim.tick < sim.speedBoostUntil || sim.tick < sim.padUntil ? 1 : 0,
      reducedFlash: Boolean(this.opts.reducedFlash),
    });

    if (this.finishPortal.visible) {
      this.finishPortal.position.set(0, 0, -(sim.portalZ - this.renderZ));
      this.finishPortal.rotation.z = this.time * 0.5;
    }

    // Camera
    const k = 1 - Math.exp(-dt * 6);
    this.camX += (runnerX * 0.62 - this.camX) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const amp = this.shake * this.shake * (this.opts.reducedShake ? 0.2 : 1) * 0.35;
    const intro = this.mode === 'countdown' ? Math.max(0, this.countdown / 3.2) : 0;
    const cam = this.camera;
    const hT = sim.phase === 'down' ? 4.3 : sim.phase === 'finishing' ? 3.9 : ultActive ? 2.75 : 3.25;
    const dT = sim.phase === 'down' ? 7.4 : sim.phase === 'finishing' ? 7.8 : ultActive ? 5.5 : 6.4;
    const kc = 1 - Math.exp(-(dt || 0.016) * 3);
    this.camH += (hT - this.camH) * kc;
    this.camD += (dT - this.camD) * kc;
    const bob = this.mode === 'run' && sim.phase === 'run' ? Math.sin(this.time * (8 + sim.speed * 0.12)) * 0.035 : 0;
    cam.position.set(this.camX + (Math.random() - 0.5) * amp, this.camH + bob + intro * 2.2 + (Math.random() - 0.5) * amp, this.camD + intro * 5);
    cam.lookAt(this.camX * 0.85, 1.25, -12);
    cam.rotation.z += -this.runner.lean * 0.035;
    const baseFov = this.camera.aspect < 0.5 ? 68 : 62;
    const fovTarget = baseFov + speedFactor * 5 + (sim.tick < sim.speedBoostUntil ? 4 : 0) + (sim.tick < sim.padUntil ? 5 : 0) + (ultActive ? 15 : 0) + (sim.phase === 'finishing' ? 10 : 0);
    cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 4 + 0.001);
    cam.updateProjectionMatrix();
    if (this.bloom) this.bloom.strength = (this.q.tier === 'high' ? 0.8 : 0.65) + (ultActive ? 0.45 : 0);

    this.renderOnce(dt);
  }

  private renderOnce(_dt: number) {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Drops quality automatically if the device can't hold ~40 fps. Gameplay is unaffected. */
  private trackPerf(dt: number) {
    if (this.mode !== 'run' || this.checkedPerf) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 150) return;
    const avg = this.frameTimes.slice(30).reduce((a, b) => a + b, 0) / (this.frameTimes.length - 30);
    this.frameTimes = [];
    if (avg > 1 / 40 && this.q.tier !== 'low' && this.downgrades < 2) {
      this.downgrades++;
      this.q = profileFor(this.q.tier === 'high' ? 'medium' : 'low');
      rememberTier(this.q.tier);
      this.setupPost();
      this.resize();
    } else {
      this.checkedPerf = true;
    }
  }

  private gainHist: { t: number; pts: number }[] = [];

  private hud(): HudState {
    const s = this.sim;
    const sc = this.opts.config.sim.score;
    const raw = s.z * sc.perMeter + s.pickupPts + s.comboPts + s.nearPts;
    // Points earned from pickups/combo/near misses over the last second (combo panel "+N").
    const bonus = (s.pickupPts + s.comboPts + s.nearPts) * s.route.scoreModifier;
    this.gainHist.push({ t: s.tick, pts: bonus });
    while (this.gainHist.length > 1 && s.tick - this.gainHist[0].t > 60) this.gainHist.shift();
    const route = s.route;
    return {
      phase: this.mode === 'countdown' ? 'countdown' : s.phase,
      distance: Math.floor(s.z),
      score: Math.floor(raw * s.route.scoreModifier),
      time: s.timeLeft,
      combo: s.combo,
      mult: s.comboMult,
      shards: s.shards,
      shieldCharges: s.shieldCharges,
      shieldActive: s.shieldActive ? (s.shieldUntil - s.tick) / (s.mods.shieldDurationSec * TICK_RATE) : 0,
      magnetCharges: s.magnetCharges,
      magnetActive: s.magnetActive ? (s.magnetUntil - s.tick) / (s.mods.magnetDurationSec * TICK_RATE) : 0,
      ult: s.ult,
      ultActive: s.ultActive ? (s.ultUntil - s.tick) / (s.mods.ultDurationSec * TICK_RATE) : 0,
      boostShields: s.boostShields,
      speedBoost: s.tick < s.speedBoostUntil,
      invulnerable: s.tick < s.invulnUntil,
      progress: Math.min(1, s.tick / s.durationTicks),
      checkpoints: route.checkpointTimes.filter((t) => t < route.durationSec - 3).map((t) => t / route.durationSec),
      climax: route.climax ? 1 - route.climax.lastSec / route.durationSec : null,
      climaxActive: s.climaxStarted && s.phase !== 'finishing' && !s.done,
      pad: s.tick < s.padUntil,
      gain: Math.max(0, Math.round(bonus - this.gainHist[0].pts)),
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('keydown', this.onKey);
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerup', this.onPointerUp);
    this.host.removeEventListener('pointercancel', this.onPointerUp);
    this.world.dispose();
    this.views.dispose();
    this.runner.dispose();
    this.composer?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
