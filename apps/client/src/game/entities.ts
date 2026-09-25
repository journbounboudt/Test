import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Entity, RunSim } from '@void-rush/shared';
import { blockerFace, chevronTexture, glowTexture, hazardStripes, hexGridTexture, scanTexture } from './textures';
import { LANE_W, TRACK_W, VIEW_LEN, laneX, type Palette } from './world';

type HazardKind = 'blocker' | 'gate' | 'laser' | 'hole' | 'debris' | 'spike' | 'mine' | 'pulse' | 'rotor' | 'checkpoint';
type PickKind = 'shard' | 'credit' | 'charge' | 'core' | 'pad';

interface View {
  kind: HazardKind;
  obj: THREE.Group;
  width: number;
  update(e: Entity, ctx: SyncCtx, lane: number): void;
}

export interface SyncCtx {
  sim: RunSim;
  renderZ: number;
  time: number;
  speed: number;
  tickF: number;
  onTelegraph(id: number): void;
}

const lanesOf = (mask: number) => [0, 1, 2].filter((l) => mask & (1 << l));

export class EntityViews {
  readonly group = new THREE.Group();
  private readonly P: Palette;
  private readonly pools = new Map<string, View[]>();
  private readonly active = new Map<string, View>();
  private readonly seen = new Set<string>();
  private readonly telegraphed = new Set<number>();
  private readonly mats: Record<string, THREE.Material>;
  private readonly geos: Record<string, THREE.BufferGeometry>;
  private readonly pick: Record<PickKind, THREE.InstancedMesh>;
  private readonly flying: { kind: 'shard' | 'credit' | 'charge' | 'core'; x: number; y: number; z: number; t: number }[] = [];
  private readonly shardGlow: THREE.InstancedMesh;
  camera: THREE.Camera | null = null;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, P: Palette) {
    this.P = P;
    scene.add(this.group);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0c14, metalness: 0.85, roughness: 0.32 });
    const faceMat = (withX: boolean) => new THREE.MeshStandardMaterial({ map: blockerFace(withX), emissiveMap: blockerFace(withX), emissive: new THREE.Color(P.danger).multiplyScalar(1.6), metalness: 0.8, roughness: 0.3 });
    const stripes = hazardStripes();
    const danger = new THREE.Color(P.danger);
    this.mats = {
      dark,
      blockX: faceMat(true),
      blockB: faceMat(false),
      stripes: new THREE.MeshStandardMaterial({ map: stripes, emissiveMap: stripes, emissive: 0xffffff, emissiveIntensity: 1.3, metalness: 0.6, roughness: 0.4 }),
      beam: new THREE.MeshBasicMaterial({ color: danger.clone().multiplyScalar(3), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
      beamGlow: new THREE.MeshBasicMaterial({ map: glowTexture(), color: danger, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
      redCore: new THREE.MeshBasicMaterial({ color: danger.clone().multiplyScalar(2.5) }),
      void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      abyss: new THREE.MeshBasicMaterial({ map: glowTexture(), color: P.accent2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
      holeEdge: new THREE.MeshBasicMaterial({ color: new THREE.Color(P.edge).multiplyScalar(2.2) }),
      rock: new THREE.MeshStandardMaterial({ color: P.rock, flatShading: true, roughness: 0.9, metalness: 0.2, emissive: P.danger, emissiveIntensity: 0.15 }),
      marker: new THREE.MeshBasicMaterial({ color: danger.clone().multiplyScalar(2), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      spike: new THREE.MeshStandardMaterial({ color: 0x0a0612, emissive: P.accent2, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.15, flatShading: true }),
      pulse: new THREE.MeshBasicMaterial({ map: scanTexture(), color: danger.clone().multiplyScalar(1.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      openFrame: new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent).multiplyScalar(2.4) }),
      cpFrame: new THREE.MeshStandardMaterial({ color: 0x0a0c14, emissive: P.accent, emissiveIntensity: 2.2, metalness: 0.8, roughness: 0.3 }),
      cpHolo: new THREE.MeshBasicMaterial({ map: hexGridTexture(), color: P.accent, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      pylon: new THREE.MeshStandardMaterial({ color: 0x0c0d14, metalness: 0.9, roughness: 0.3, emissive: P.danger, emissiveIntensity: 0.25 }),
      rotorBlade: new THREE.MeshStandardMaterial({ map: stripes, color: 0x6a6a78, emissiveMap: stripes, emissive: 0xffffff, emissiveIntensity: 0.55, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    };
    const cones: THREE.BufferGeometry[] = [];
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const p = ico.attributes.position;
    const seenDir = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const k = v.toArray().map((n) => n.toFixed(2)).join();
      if (seenDir.has(k)) continue;
      seenDir.add(k);
      const cone = new THREE.ConeGeometry(0.16, 0.55, 5);
      cone.translate(0, 0.62, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
      cones.push(cone.toNonIndexed());
    }
    this.geos = {
      block: new THREE.BoxGeometry(1.75, 1.75, 1.75),
      gate1: new THREE.BoxGeometry(LANE_W - 0.25, 2.1, 0.45),
      gate2: new THREE.BoxGeometry(LANE_W * 2 - 0.25, 2.1, 0.45),
      post: new THREE.BoxGeometry(0.22, 2.5, 0.5),
      pylon: new THREE.CylinderGeometry(0.11, 0.16, 1.7, 8),
      beam: new THREE.CylinderGeometry(0.05, 0.05, 1, 6).rotateZ(Math.PI / 2),
      plane: new THREE.PlaneGeometry(1, 1),
      mineShell: new THREE.IcosahedronGeometry(0.46, 0),
      mineSpikes: mergeGeometries(cones),
      sphere: new THREE.SphereGeometry(0.24, 12, 10),
      rock: new THREE.DodecahedronGeometry(0.72, 0),
      ring: new THREE.RingGeometry(0.55, 0.85, 28).rotateX(-Math.PI / 2),
      spike: new THREE.ConeGeometry(0.26, 1.2, 5),
      bar: new THREE.BoxGeometry(1, 1, 1),
    };

    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    const shardGeo = new THREE.OctahedronGeometry(0.3, 0).scale(0.8, 1.55, 0.8);
    this.pick = {
      shard: inst(shardGeo, new THREE.MeshStandardMaterial({ color: 0xb98cff, emissive: 0x8a4dff, emissiveIntensity: 1.7, metalness: 0.2, roughness: 0.12, flatShading: true }), 220),
      credit: inst(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffc53d, emissive: 0xff9a1f, emissiveIntensity: 0.9, metalness: 1, roughness: 0.25 }), 50),
      charge: inst(new THREE.CapsuleGeometry(0.18, 0.34, 4, 10), new THREE.MeshStandardMaterial({ color: 0x9ff0ff, emissive: 0x35d7ff, emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.2 }), 30),
      core: inst(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({ color: 0xff7a5a, emissive: 0xff3d57, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.2, flatShading: true }), 80),
      pad: inst(new THREE.PlaneGeometry(LANE_W * 0.72, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chevronTexture(), color: new THREE.Color(1.4, 1.8, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 24),
    };
    // Crystal core glow inside each shard (second instanced layer, additive).
    this.shardGlow = inst(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9a5cff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), 220);

    const prewarm: [HazardKind, number, number][] = [
      ['blocker', 1, 12], ['gate', 1, 4], ['gate', 2, 6], ['laser', 1, 4], ['laser', 2, 4], ['hole', 1, 10], ['debris', 1, 8], ['spike', 1, 16], ['mine', 1, 6], ['pulse', 1, 4], ['rotor', 1, 3], ['checkpoint', 1, 2],
    ];
    for (const [k, w, n] of prewarm) for (let i = 0; i < n; i++) this.release(this.create(k, w));
  }

  private poolKey(kind: HazardKind, width: number) {
    return `${kind}:${width}`;
  }

  private release(v: View) {
    v.obj.visible = false;
    const key = this.poolKey(v.kind, v.width);
    let pool = this.pools.get(key);
    if (!pool) this.pools.set(key, (pool = []));
    pool.push(v);
  }

  private acquire(kind: HazardKind, width: number): View {
    const v = this.pools.get(this.poolKey(kind, width))?.pop() ?? this.create(kind, width);
    v.obj.visible = true;
    return v;
  }

  private create(kind: HazardKind, width: number): View {
    const M = this.mats;
    const G = this.geos;
    const obj = new THREE.Group();
    this.group.add(obj);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
      const o = new THREE.Mesh(g, m);
      obj.add(o);
      return o;
    };
    const base: View = { kind, obj, width, update: () => undefined };
    switch (kind) {
      case 'blocker': {
        const cube = mesh(G.block, [M.blockB, M.blockB, M.blockB, M.dark, M.blockX, M.blockB]);
        cube.position.y = 0.9;
        base.update = (e, ctx) => {
          obj.position.set(laneX(e.lane), 0, -(e.z - ctx.renderZ));
        };
        break;
      }
      case 'gate': {
        const panel = mesh(width === 2 ? G.gate2 : G.gate1, [M.dark, M.dark, M.dark, M.dark, M.stripes, M.dark]);
        panel.position.y = 1.05;
        const half = (LANE_W * width) / 2;
        for (const s of [-1, 1]) {
          const post = mesh(G.post, M.cpFrame);
          post.position.set(s * (half - 0.05), 1.25, 0);
        }
        base.update = (e, ctx) => {
          const ls = lanesOf(e.mask);
          const cx = (laneX(ls[0]) + laneX(ls[ls.length - 1])) / 2;
          obj.position.set(cx, 0, -(e.z - ctx.renderZ));
        };
        break;
      }
      case 'laser': {
        const span = LANE_W * width;
        for (const s of [-1, 1]) {
          const py = mesh(G.pylon, M.pylon);
          py.position.set((s * span) / 2, 0.85, 0);
          const tip = mesh(G.sphere, M.redCore);
          tip.position.set((s * span) / 2, 1.75, 0);
          tip.scale.setScalar(0.6);
        }
        const beams: THREE.Mesh[] = [];
        const glows: THREE.Mesh[] = [];
        for (const y of [0.55, 1.25]) {
          const b = mesh(G.beam, M.beam);
          b.scale.set(span, 1, 1);
          b.position.y = y;
          beams.push(b);
          const gl = mesh(G.plane, M.beamGlow);
          gl.scale.set(span, 0.7, 1);
          gl.position.y = y;
          glows.push(gl);
        }
        base.update = (e, ctx) => {
          const ls = lanesOf(e.mask);
          const cx = (laneX(ls[0]) + laneX(ls[ls.length - 1])) / 2;
          obj.position.set(cx, 0, -(e.z - ctx.renderZ));
          const dist = e.z - ctx.renderZ;
          const armed = dist < ctx.speed * 1.1;
          if (armed && !this.telegraphed.has(e.id)) {
            this.telegraphed.add(e.id);
            ctx.onTelegraph(e.id);
          }
          const flick = armed ? 1 : Math.sin(ctx.time * 22) > 0 ? 0.45 : 0.12;
          beams.forEach((b) => b.scale.set(span, armed ? 2.2 : 0.7, armed ? 2.2 : 0.7));
          beams.forEach((b) => (b.visible = flick > 0.2));
          glows.forEach((g) => g.scale.set(span, armed ? 0.9 : 0.35, 1));
          glows.forEach((g) => (g.visible = armed || flick > 0.2));
        };
        break;
      }
      case 'hole': {
        const pit = mesh(G.plane, M.void);
        pit.rotation.x = -Math.PI / 2;
        pit.position.y = 0.015;
        const glow = mesh(G.plane, M.abyss);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.02;
        const edges: THREE.Mesh[] = [];
        for (let i = 0; i < 4; i++) edges.push(mesh(G.bar, M.holeEdge));
        base.update = (e, ctx) => {
          const w = LANE_W - 0.12;
          const len = e.len;
          obj.position.set(0, 0, -(e.z - ctx.renderZ));
          pit.scale.set(w, len, 1);
          pit.position.set(0, 0.015, -len / 2);
          glow.scale.set(w * 0.9, len * 0.9, 1);
          glow.position.set(0, 0.02, -len / 2);
          edges[0].scale.set(w, 0.06, 0.1);
          edges[0].position.set(0, 0.04, 0);
          edges[1].scale.set(w, 0.06, 0.1);
          edges[1].position.set(0, 0.04, -len);
          edges[2].scale.set(0.08, 0.06, len);
          edges[2].position.set(-w / 2, 0.04, -len / 2);
          edges[3].scale.set(0.08, 0.06, len);
          edges[3].position.set(w / 2, 0.04, -len / 2);
        };
        break;
      }
      case 'debris': {
        const rock = mesh(G.rock, M.rock);
        const marker = mesh(G.ring, M.marker);
        marker.position.y = 0.03;
        base.update = (e, ctx) => {
          obj.position.set(laneX(e.lane), 0, -(e.z - ctx.renderZ));
          const dist = e.z - ctx.renderZ;
          const fallWindow = ctx.speed * 1.2;
          const prog = THREE.MathUtils.clamp(1 - (dist - ctx.speed * 0.35) / fallWindow, 0, 1);
          rock.position.y = 0.7 + (1 - prog * prog) * 16;
          rock.rotation.set(ctx.time * 2 + e.id, ctx.time * 1.3, 0);
          marker.visible = prog < 1;
          const pulse = 0.8 + Math.sin(ctx.time * 12) * 0.2;
          marker.scale.setScalar(pulse * (0.7 + prog * 0.5));
        };
        break;
      }
      case 'spike': {
        for (const [x, s] of [[0, 1], [-0.28, 0.7], [0.3, 0.8]] as const) {
          const sp = mesh(G.spike, M.spike);
          sp.position.set(x, 0.6 * s, (x * 0.5));
          sp.scale.set(s, s, s);
        }
        base.update = (e, ctx) => {
          obj.position.set(laneX(e.lane), 0, -(e.z - ctx.renderZ));
        };
        break;
      }
      case 'mine': {
        const shell = mesh(G.mineShell, M.dark);
        const spikes = mesh(G.mineSpikes, M.dark);
        const core = mesh(G.sphere, M.redCore);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: this.P.danger, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(2.2, 2.2, 1);
        obj.add(glow);
        for (const o of [shell, spikes, core, glow]) o.position.y = 0.95;
        base.update = (e, ctx) => {
          const mx = ctx.sim.mineX(e, ctx.tickF);
          obj.position.set((mx - 1) * LANE_W, Math.sin(ctx.time * 3 + e.id) * 0.08, -(e.z - ctx.renderZ));
          shell.rotation.set(ctx.time * 1.5, ctx.time * 2, 0);
          spikes.rotation.copy(shell.rotation);
          glow.material.opacity = 0.6 + Math.sin(ctx.time * 10) * 0.3;
        };
        break;
      }
      case 'pulse': {
        const panels: THREE.Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const pnl = mesh(G.plane, M.pulse);
          pnl.scale.set(LANE_W - 0.08, 2.6, 1);
          pnl.position.set(laneX(i), 1.3, 0);
          panels.push(pnl);
        }
        const frame: THREE.Mesh[] = [];
        for (let i = 0; i < 3; i++) frame.push(mesh(G.bar, M.openFrame));
        base.update = (e, ctx) => {
          obj.position.set(0, 0, -(e.z - ctx.renderZ));
          panels.forEach((p, i) => (p.visible = i !== e.open));
          const ox = laneX(e.open ?? 1);
          frame[0].scale.set(0.1, 2.7, 0.1);
          frame[0].position.set(ox - LANE_W / 2 + 0.05, 1.35, 0);
          frame[1].scale.set(0.1, 2.7, 0.1);
          frame[1].position.set(ox + LANE_W / 2 - 0.05, 1.35, 0);
          frame[2].scale.set(LANE_W, 0.1, 0.1);
          frame[2].position.set(ox, 2.68, 0);
          const mat = M.pulse as THREE.MeshBasicMaterial;
          if (mat.map) mat.map.offset.y = ctx.time * 1.5;
        };
        break;
      }
      case 'rotor': {
        // A hanging blade disk; its gap sweeps round and settles over the open lane on arrival.
        const cy = 4.3;
        const gap = 0.62;
        const disk = new THREE.Group();
        disk.position.y = cy;
        obj.add(disk);
        const blade = new THREE.Mesh(new THREE.RingGeometry(0.9, 5.4, 64, 1, gap / 2, Math.PI * 2 - gap), M.rotorBlade.clone());
        disk.add(blade);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.12, 6, 72, Math.PI * 2 - gap), M.redCore);
        rim.rotation.z = gap / 2;
        disk.add(rim);
        for (let i = 0; i < 6; i++) {
          const spoke = new THREE.Mesh(G.bar, M.pylon);
          const a = gap / 2 + ((Math.PI * 2 - gap) * (i + 0.5)) / 6;
          spoke.scale.set(4.5, 0.14, 0.14);
          spoke.position.set(Math.cos(a) * 3.15, Math.sin(a) * 3.15, 0.05);
          spoke.rotation.z = a;
          disk.add(spoke);
        }
        for (const sgn of [-1, 1]) {
          const edge = new THREE.Mesh(G.bar, M.openFrame);
          const a = sgn * (gap / 2);
          edge.scale.set(4.5, 0.08, 0.08);
          edge.position.set(Math.cos(a) * 3.15, Math.sin(a) * 3.15, 0.08);
          edge.rotation.z = a;
          disk.add(edge);
        }
        const hub = new THREE.Mesh(G.mineShell, M.dark);
        hub.scale.setScalar(2.2);
        disk.add(hub);
        const hubGlow = new THREE.Mesh(G.sphere, M.redCore);
        hubGlow.scale.setScalar(1.6);
        hubGlow.position.z = 0.4;
        disk.add(hubGlow);
        base.update = (e, ctx) => {
          const dist = e.z - ctx.renderZ;
          obj.position.set(0, 0, -dist);
          const target = Math.atan2(1.0 - cy, laneX(e.open ?? 1));
          disk.rotation.z = target + Math.max(0, dist) * 0.07;
          // Once passed, the disk sits between camera and Runner: fade it out so it never blinds the view.
          const fade = THREE.MathUtils.clamp((dist + 0.5) / 4, 0, 1);
          obj.visible = fade > 0.02;
          (blade.material as THREE.MeshStandardMaterial).opacity = 0.9 * fade;
          disk.scale.setScalar(0.85 + 0.15 * fade);
        };
        break;
      }
      case 'checkpoint': {
        const half = TRACK_W / 2 + 0.3;
        for (const s of [-1, 1]) {
          const post = mesh(G.bar, M.cpFrame);
          post.scale.set(0.3, 4.2, 0.3);
          post.position.set(s * half, 2.1, 0);
        }
        const top = mesh(G.bar, M.cpFrame);
        top.scale.set(half * 2 + 0.3, 0.3, 0.3);
        top.position.set(0, 4.2, 0);
        const holo = mesh(G.plane, M.cpHolo);
        holo.scale.set(half * 2, 4, 1);
        holo.position.set(0, 2.1, 0);
        base.update = (e, ctx) => {
          const dist = e.z - ctx.renderZ;
          obj.position.set(0, 0, -dist);
          // Once the Runner is through, the gate sits between him and the camera: hide it.
          obj.visible = dist > 2.5;
          const near = THREE.MathUtils.clamp((dist - 2.5) / 10, 0, 1);
          (M.cpHolo as THREE.MeshBasicMaterial).opacity = (0.16 + Math.sin(ctx.time * 4) * 0.05) * near;
        };
        break;
      }
    }
    return base;
  }

  /** Lane/world position of an entity for VFX spawned by sim events. */
  worldPos(e: { lane: number; z: number }, renderZ: number, out = new THREE.Vector3()) {
    return out.set(laneX(e.lane), 0.9, -(e.z - renderZ));
  }

  addFlying(kind: 'shard' | 'credit' | 'charge' | 'core', lane: number, z: number, renderZ: number) {
    if (this.flying.length > 40) this.flying.shift();
    this.flying.push({ kind, x: laneX(lane), y: 0.9, z: -(z - renderZ), t: 0 });
  }

  sync(ctx: SyncCtx, runnerX: number, dt: number, hideAhead: number | null) {
    const { sim, renderZ, time } = ctx;
    this.seen.clear();
    const counts = { shard: 0, credit: 0, charge: 0, core: 0, pad: 0 };
    let glowCount = 0;
    const d = this.dummy;
    const far = renderZ + VIEW_LEN - 50;
    for (let i = sim.first; i < sim.entities.length; i++) {
      const e = sim.entities[i];
      const key0 = e.z0 ?? e.z;
      if (key0 > far + 20) break;
      const end = e.kind === 'hole' ? e.z + e.len : e.z;
      if (end < renderZ - 14 || e.z > far) continue;
      if (hideAhead !== null && e.z > hideAhead && e.state === 2 && e.kind !== 'checkpoint') continue;
      if (e.kind === 'pad') {
        if (e.state === 1 && e.z < renderZ - 2) continue;
        const m = this.pick.pad;
        if (counts.pad >= m.instanceMatrix.count) continue;
        d.position.set(laneX(e.lane), 0.035, -(e.z - renderZ));
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(e.state === 1 ? 1.08 : 1);
        d.updateMatrix();
        m.setMatrixAt(counts.pad++, d.matrix);
        continue;
      }
      if (e.kind === 'shard' || e.kind === 'credit' || e.kind === 'charge' || e.kind === 'core') {
        if (e.state !== 0) continue;
        const m = this.pick[e.kind];
        if (counts[e.kind] >= m.instanceMatrix.count) continue;
        const bob = Math.sin(time * 3 + e.id * 0.7) * 0.1;
        d.position.set(laneX(e.lane), 0.95 + bob, -(e.z - renderZ));
        d.rotation.set(0, time * 2.4 + e.id, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        m.setMatrixAt(counts[e.kind]++, d.matrix);
        if (e.kind === 'shard' && this.camera && glowCount < this.shardGlow.instanceMatrix.count) {
          d.quaternion.copy(this.camera.quaternion);
          d.scale.setScalar(0.9 + Math.sin(time * 6 + e.id) * 0.1);
          d.updateMatrix();
          this.shardGlow.setMatrixAt(glowCount++, d.matrix);
        }
        continue;
      }
      if (e.kind === 'hint') continue;
      if (e.state === 1 && e.kind !== 'checkpoint') continue;
      if (e.kind === 'hole') {
        for (const lane of lanesOf(e.mask)) {
          const key = `${e.id}:${lane}`;
          this.seen.add(key);
          let v = this.active.get(key);
          if (!v) this.active.set(key, (v = this.acquire('hole', 1)));
          v.update(e, ctx, lane);
          v.obj.position.x = laneX(lane);
        }
        continue;
      }
      const kind = e.kind as HazardKind;
      const width = kind === 'gate' || kind === 'laser' ? lanesOf(e.mask).length : 1;
      const key = `${e.id}`;
      this.seen.add(key);
      let v = this.active.get(key);
      if (!v) this.active.set(key, (v = this.acquire(kind, width)));
      v.update(e, ctx, e.lane);
    }
    for (const [key, v] of this.active) {
      if (!this.seen.has(key)) {
        this.active.delete(key);
        this.release(v);
      }
    }
    // Collected pickups fly into the Runner.
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / 0.2;
      if (f.t >= 1) {
        this.flying.splice(i, 1);
        continue;
      }
      const m = this.pick[f.kind];
      if (counts[f.kind] >= m.instanceMatrix.count) continue;
      const k = f.t * f.t;
      d.position.set(THREE.MathUtils.lerp(f.x, runnerX, k), THREE.MathUtils.lerp(f.y, 1.3, k), THREE.MathUtils.lerp(f.z, 0, k));
      d.scale.setScalar(1 - k * 0.7);
      d.rotation.set(0, time * 8, 0);
      d.updateMatrix();
      m.setMatrixAt(counts[f.kind]++, d.matrix);
    }
    for (const k of ['shard', 'credit', 'charge', 'core', 'pad'] as const) {
      this.pick[k].count = counts[k];
      this.pick[k].instanceMatrix.needsUpdate = true;
    }
    this.shardGlow.count = glowCount;
    this.shardGlow.instanceMatrix.needsUpdate = true;
    const padMat = this.pick.pad.material as THREE.MeshBasicMaterial;
    if (padMat.map) padMat.map.offset.y = -time * 1.6;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
