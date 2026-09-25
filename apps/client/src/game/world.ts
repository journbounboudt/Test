import * as THREE from 'three';
import type { Theme } from '@void-rush/shared';
import type { QualityProfile } from './quality';
import type { RunSim } from '@void-rush/shared';
import { billboardTexture, floorEmissive, floorTexture, glowTexture, nebulaTexture, skyTexture, windowsTexture } from './textures';

export const LANE_W = 2.3;
export const TRACK_W = LANE_W * 3 + 1.2;
export const VIEW_LEN = 320;
const NEAR = 30;

export interface Palette {
  skyTop: number;
  skyMid: number;
  fog: number;
  floor: number;
  line: number;
  edge: number;
  accent: number;
  accent2: number;
  building: number;
  window: number;
  rock: number;
  hemiSky: number;
  hemiGround: number;
  danger: number;
}

export const PALETTES: Record<Theme, Palette> = {
  neon: { skyTop: 0x02030c, skyMid: 0x120d3a, fog: 0x120d34, floor: 0x0b1230, line: 0x3a8dff, edge: 0xff7a1a, accent: 0x35d7ff, accent2: 0x9b5cff, building: 0x0a0e22, window: 0x4a86ff, rock: 0x1d1a36, hemiSky: 0x6a7dff, hemiGround: 0x120a24, danger: 0xff3b2f },
  rift: { skyTop: 0x05020d, skyMid: 0x230b45, fog: 0x1d0a3c, floor: 0x120a2a, line: 0xa86bff, edge: 0xd46bff, accent: 0xb574ff, accent2: 0x35d7ff, building: 0x0f0a20, window: 0xb574ff, rock: 0x251a40, hemiSky: 0x9c6bff, hemiGround: 0x140a24, danger: 0xff3b5f },
  bridge: { skyTop: 0x080302, skyMid: 0x3a1206, fog: 0x2e1006, floor: 0x1a0f0b, line: 0xff7a2a, edge: 0xff4a12, accent: 0xff9a1f, accent2: 0xff4a2a, building: 0x160906, window: 0xff7a2a, rock: 0x2a1610, hemiSky: 0xff8a4a, hemiGround: 0x1a0804, danger: 0xff2a1a },
  secret: { skyTop: 0x040507, skyMid: 0x1c2029, fog: 0x1b1e27, floor: 0x14171e, line: 0xc8d4e8, edge: 0xe8f0ff, accent: 0xdfe8ff, accent2: 0x8aa2c8, building: 0x101218, window: 0xbfd0ea, rock: 0x22262f, hemiSky: 0xb8c4d8, hemiGround: 0x0c0d12, danger: 0xff3b4f },
  event: { skyTop: 0x07020a, skyMid: 0x33082e, fog: 0x290726, floor: 0x160a1c, line: 0xff4d8a, edge: 0xff3d57, accent: 0xff4d6d, accent2: 0x9b5cff, building: 0x14081a, window: 0xff4d8a, rock: 0x2a1030, hemiSky: 0xff6a9a, hemiGround: 0x16061a, danger: 0xff2a3a },
};

export function laneX(lane: number) {
  return (lane - 1) * LANE_W;
}

/** Maps a static world-space distance to a view z that loops within the visible window. */
export function wrapZ(base: number, renderZ: number, len = VIEW_LEN) {
  const d = (((base - renderZ) % len) + len) % len;
  return -(d - NEAR);
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const portalVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const portalFrag = /* glsl */ `
uniform float uTime; uniform float uBoost; uniform vec3 uA; uniform vec3 uB;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = sin(a * 5.0 + r * 16.0 - uTime * (2.5 + uBoost * 6.0)) * 0.5 + 0.5;
  float swirl2 = sin(a * 9.0 - r * 22.0 + uTime * 1.7) * 0.5 + 0.5;
  float body = smoothstep(1.0, 0.0, r);
  vec3 col = mix(uB, uA, swirl * 0.7 + swirl2 * 0.3) * (0.35 + 1.1 * smoothstep(0.9, 0.2, r));
  col += vec3(0.9, 0.95, 1.0) * smoothstep(0.32, 0.0, r) * (0.9 + uBoost);
  float rim = smoothstep(0.78, 0.95, r) * smoothstep(1.0, 0.95, r);
  col += uA * rim * 1.5;
  float alpha = body * smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

interface Loop {
  mesh: THREE.InstancedMesh;
  base: { z: number; x: number; y: number; s: THREE.Vector3; rot: THREE.Euler; spin: number }[];
}

export class World {
  readonly group = new THREE.Group();
  readonly palette: Palette;
  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly loops: Loop[] = [];
  private readonly portal = new THREE.Group();
  private readonly portalMat: THREE.ShaderMaterial;
  private readonly rings: THREE.Mesh[] = [];
  private readonly stars: THREE.Points;
  private readonly dummy = new THREE.Object3D();
  private readonly sideMat: THREE.MeshStandardMaterial;
  boss: THREE.Group | null = null;
  private bossMode: 'event' | 'climax' | null = null;
  private bossRise = 0;
  private bossVisible = false;
  private readonly bossHands: THREE.Vector3[] = [];
  private readonly beams: THREE.Mesh[] = [];
  private readonly boards: { mesh: THREE.Mesh; z: number; x: number; y: number; side: number }[] = [];

  constructor(scene: THREE.Scene, theme: Theme, q: QualityProfile) {
    const P = (this.palette = PALETTES[theme]);
    scene.background = skyTexture(theme, P.skyTop, P.skyMid, P.fog);
    scene.fog = new THREE.Fog(P.fog, 45, VIEW_LEN - 30);
    scene.add(this.group);

    // Lights
    this.group.add(new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(4, 10, 8);
    this.group.add(key);
    const rim = new THREE.DirectionalLight(P.accent2, 2.4);
    rim.position.set(-3, 4, -10);
    this.group.add(rim);
    const rim2 = new THREE.DirectionalLight(P.accent, 1.4);
    rim2.position.set(5, 2, -6);
    this.group.add(rim2);

    // Track slab
    const floorTex = floorTexture(theme, P.floor, P.line, P.edge).clone();
    floorTex.repeat.set(1, VIEW_LEN / 8);
    floorTex.needsUpdate = true;
    const floorE = floorEmissive(theme, P.line, P.edge).clone();
    floorE.repeat.set(1, VIEW_LEN / 8);
    floorE.needsUpdate = true;
    this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex, emissiveMap: floorE, emissive: 0xffffff, emissiveIntensity: 1.0, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.35 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W * 1.25, VIEW_LEN), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = NEAR - VIEW_LEN / 2;
    this.group.add(floor);
    this.sideMat = new THREE.MeshStandardMaterial({ color: 0x07080f, metalness: 0.7, roughness: 0.4, emissive: P.edge, emissiveIntensity: 0.12 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W * 1.25, 1.2, VIEW_LEN), this.sideMat);
    slab.position.set(0, -0.61, NEAR - VIEW_LEN / 2);
    this.group.add(slab);
    const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.edge).multiplyScalar(2.2) });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, VIEW_LEN), railMat);
      rail.position.set(s * (TRACK_W / 2 + 0.25), 0.06, NEAR - VIEW_LEN / 2);
      this.group.add(rail);
      const under = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, VIEW_LEN), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent2).multiplyScalar(1.6) }));
      under.position.set(s * (TRACK_W * 0.625), -1.18, NEAR - VIEW_LEN / 2);
      this.group.add(under);
    }

    const r = rng(theme.length * 977 + 13);
    const addLoop = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, place: (i: number) => Loop['base'][number]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false;
      const base = Array.from({ length: count }, (_, i) => place(i));
      this.group.add(mesh);
      this.loops.push({ mesh, base });
    };

    // Light posts along the rails
    const postMat = new THREE.MeshStandardMaterial({ color: 0x0a0c14, emissive: P.accent, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 });
    addLoop(new THREE.BoxGeometry(0.14, 1.4, 0.14), postMat, 28, (i) => ({ z: (i >> 1) * (VIEW_LEN / 14), x: (i % 2 ? 1 : -1) * (TRACK_W / 2 + 0.45), y: 0.7, s: new THREE.Vector3(1, 1, 1), rot: new THREE.Euler(), spin: 0 }));

    // Arches framing the run
    const archMat = new THREE.MeshStandardMaterial({ color: 0x080a12, emissive: P.accent2, emissiveIntensity: 1.4, metalness: 0.9, roughness: 0.3 });
    const archGeo = new THREE.TorusGeometry(TRACK_W * 0.95, 0.22, 6, 40, Math.PI);
    addLoop(archGeo, archMat, 4, (i) => ({ z: i * (VIEW_LEN / 4) + 40, x: 0, y: -0.4, s: new THREE.Vector3(1, 1.05, 1), rot: new THREE.Euler(0, 0, 0), spin: 0 }));

    // City ruins, three proportions so windows don't stretch badly
    const winTex = windowsTexture(theme, P.window);
    const bMat = new THREE.MeshStandardMaterial({ color: P.building, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.6, envMapIntensity: 0.25 });
    const per = Math.floor(q.buildings / 3);
    for (const [w, h, vRep] of [[5, 34, 3], [7, 18, 1.6], [9, 9, 0.9]] as const) {
      const g = new THREE.BoxGeometry(w, h, w);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * vRep);
      addLoop(g, bMat, per, () => {
        const side = r() < 0.5 ? -1 : 1;
        const scale = 0.7 + r() * 0.8;
        return { z: r() * VIEW_LEN, x: side * (14 + r() * 40), y: h * scale * 0.5 - 6 - r() * 10, s: new THREE.Vector3(1, scale, 1), rot: new THREE.Euler(0, r() * 0.6, (r() - 0.5) * 0.12), spin: 0 };
      });
    }

    // Floating void rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: P.rock, metalness: 0.3, roughness: 0.85, flatShading: true, emissive: P.accent2, emissiveIntensity: 0.05, envMapIntensity: 0.3 });
    addLoop(new THREE.IcosahedronGeometry(1, 0), rockMat, q.rocks, () => {
      const side = r() < 0.5 ? -1 : 1;
      const s = 0.4 + r() * 2.6;
      return { z: r() * VIEW_LEN, x: side * (7 + r() * 34), y: -4 + r() * 30, s: new THREE.Vector3(s, s * (0.7 + r() * 0.6), s), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), spin: (r() - 0.5) * 0.8 };
    });
    // Broken slabs drifting beside the track
    addLoop(new THREE.BoxGeometry(1, 1, 1), rockMat, Math.floor(q.rocks / 2), () => {
      const side = r() < 0.5 ? -1 : 1;
      return { z: r() * VIEW_LEN, x: side * (6.5 + r() * 8), y: -1.5 - r() * 9, s: new THREE.Vector3(1 + r() * 3, 0.4 + r() * 1.2, 1 + r() * 3), rot: new THREE.Euler((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5), spin: (r() - 0.5) * 0.2 };
    });

    // Voxel blocks hugging the track (instanced), with emissive tops.
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x0a0c16, metalness: 0.75, roughness: 0.4, emissive: P.accent2, emissiveIntensity: 0.18, envMapIntensity: 0.4 });
    addLoop(new THREE.BoxGeometry(1, 1, 1), blockMat, q.tier === 'low' ? 24 : 48, () => {
      const side = r() < 0.5 ? -1 : 1;
      const s = 0.6 + r() * 1.6;
      return { z: r() * VIEW_LEN, x: side * (TRACK_W / 2 + 1.2 + r() * 3.2), y: -0.8 + r() * 1.6 - s * 0.3, s: new THREE.Vector3(s, s * (0.6 + r() * 0.9), s), rot: new THREE.Euler(0, r() * 0.5, 0), spin: 0 };
    });

    // Void portal at the horizon
    this.portalMat = new THREE.ShaderMaterial({
      vertexShader: portalVert,
      fragmentShader: portalFrag,
      uniforms: { uTime: { value: 0 }, uBoost: { value: 0 }, uA: { value: new THREE.Color(P.accent) }, uB: { value: new THREE.Color(P.accent2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(30, 64), this.portalMat);
    this.portal.add(disc);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent).multiplyScalar(2.2), fog: false });
    const ringMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.accent2).multiplyScalar(2), fog: false, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(30 + i * 5, 0.6 - i * 0.12, 8, 96, Math.PI * (1.4 + i * 0.2)), i === 0 ? ringMat : ringMat2);
      ring.rotation.z = i * 1.3;
      this.rings.push(ring);
      this.portal.add(ring);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: P.accent2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.set(150, 150, 1);
    this.portal.add(halo);
    const nebTex = nebulaTexture();
    for (let i = 0; i < 5; i++) {
      const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, color: i % 2 ? P.accent2 : P.accent, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      neb.position.set((r() - 0.5) * 260, (r() - 0.3) * 120, -30 - r() * 40);
      neb.scale.setScalar(160 + r() * 140);
      neb.material.rotation = r() * 6;
      this.portal.add(neb);
    }
    this.portal.position.set(0, 18, -VIEW_LEN + 30);
    this.group.add(this.portal);

    // Stars
    const sg = new THREE.BufferGeometry();
    const pos = new Float32Array(q.stars * 3);
    for (let i = 0; i < q.stars; i++) {
      const th = r() * Math.PI * 2;
      const ph = Math.acos(r() * 1.4 - 0.4);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 600;
      pos[i * 3 + 1] = Math.cos(ph) * 600;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 600 - 200;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.group.add(this.stars);

    if (theme === 'event') {
      this.boss = this.buildBoss(P);
      this.bossMode = 'event';
      this.bossVisible = true;
      this.bossRise = 1;
    } else if (theme === 'bridge' || theme === 'secret') {
      this.boss = this.buildBoss(P);
      this.boss.visible = false;
      this.bossMode = 'climax';
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.danger).multiplyScalar(2.5), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), beamMat);
      b.visible = false;
      b.frustumCulled = false;
      this.beams.push(b);
      this.group.add(b);
    }

    // Holographic slogan boards along the track (reference art detail).
    const slogans: [string[], string][] = [
      [['БОЛЬШЕ', 'ЗАБЕГОВ', 'БОЛЬШЕ', 'ИСТОРИЙ'], '#6fb8ff'],
      [['GO', 'FURTHER', 'YOU'], '#7fe6ff'],
      [['GOOD', 'RUNS', 'BETTER', 'YOU'], '#b58cff'],
      [['60', 'СЕКУНД', 'ДО', 'ЛЕГЕНДЫ'], '#ffb45a'],
    ];
    for (let i = 0; i < 6; i++) {
      const [lines, color] = slogans[i % slogans.length];
      const tex = billboardTexture(lines, color);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), mat);
      const side = i % 2 ? 1 : -1;
      mesh.rotation.y = -side * 0.55;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.boards.push({ mesh, z: 30 + i * (VIEW_LEN / 6), x: side * (TRACK_W / 2 + 3.4), y: 2.6 + r() * 1.5, side });
    }
  }

  /** Distant community boss silhouette for event runs. */
  private buildBoss(P: Palette) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a060e, metalness: 0.4, roughness: 0.7, flatShading: true, emissive: P.accent2, emissiveIntensity: 0.12, fog: false });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      g.add(m);
      return m;
    };
    const rock = new THREE.IcosahedronGeometry(1, 0);
    add(rock, 0, 30, 0, 22, 26, 14);
    add(rock, 0, 62, 0, 11, 12, 10);
    add(rock, -26, 38, 0, 12, 10, 10);
    add(rock, 26, 38, 0, 12, 10, 10);
    add(rock, -36, 16, 4, 7, 16, 7);
    add(rock, 36, 16, 4, 7, 16, 7);
    this.bossHands.push(new THREE.Vector3(-36, 4, 8), new THREE.Vector3(36, 4, 8), new THREE.Vector3(0, 60, 12));
    const handMat = new THREE.SpriteMaterial({ map: glowTexture(), color: P.danger, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const h of this.bossHands.slice(0, 2)) {
      const s = new THREE.Sprite(handMat);
      s.position.copy(h);
      s.scale.set(12, 12, 1);
      g.add(s);
    }
    const eyeMat = new THREE.SpriteMaterial({ map: glowTexture(), color: P.danger, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(eyeMat);
      eye.position.set(s * 4, 63, 10);
      eye.scale.set(9, 5, 1);
      g.add(eye);
    }
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: P.accent2, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    core.position.set(0, 34, 15);
    core.scale.set(26, 26, 1);
    g.add(core);
    g.position.set(0, -10, -VIEW_LEN + 50);
    this.group.add(g);
    return g;
  }

  spawnBoss() {
    if (!this.boss || this.bossMode !== 'climax') return;
    this.boss.visible = true;
    this.bossVisible = true;
  }

  hideBoss() {
    if (this.bossMode === 'climax') this.bossVisible = false;
    for (const b of this.beams) b.visible = false;
  }

  /** Climax boss rises from the void and "throws" the debris: beams track debris landing markers. */
  updateBoss(time: number, dt: number, sim: RunSim, renderZ: number) {
    if (!this.boss) return;
    const target = this.bossVisible ? 1 : 0;
    this.bossRise += (target - this.bossRise) * Math.min(1, dt * 1.6);
    if (this.bossMode === 'climax') {
      this.boss.visible = this.bossRise > 0.01;
      this.boss.position.set(Math.sin(time * 0.7) * 5, -80 + this.bossRise * 62 + Math.sin(time * 1.3) * 1.5, -125);
      this.boss.scale.setScalar(0.7);
      this.boss.rotation.y = Math.sin(time * 0.5) * 0.15;
    }
    let bi = 0;
    if (this.bossVisible && this.bossMode === 'climax' && this.bossRise > 0.6) {
      for (let i = sim.first; i < sim.entities.length && bi < this.beams.length; i++) {
        const e = sim.entities[i];
        const dist = e.z - renderZ;
        if (dist > sim.speed * 1.6) break;
        if (e.kind !== 'debris' || e.state !== 0 || dist < sim.speed * 0.3) continue;
        const hand = this.bossHands[bi % this.bossHands.length];
        const from = this.boss.localToWorld(hand.clone());
        const to = new THREE.Vector3((e.lane - 1) * LANE_W, 0.05, -dist);
        const beam = this.beams[bi++];
        beam.visible = true;
        beam.position.copy(from);
        beam.lookAt(to);
        beam.scale.set(1 + Math.sin(time * 40 + i) * 0.3, 1 + Math.sin(time * 40 + i) * 0.3, from.distanceTo(to));
      }
    }
    for (; bi < this.beams.length; bi++) this.beams[bi].visible = false;
  }

  update(renderZ: number, dt: number, time: number, boost: number) {
    for (const b of this.boards) {
      b.mesh.position.set(b.x, b.y + Math.sin(time * 0.8 + b.z) * 0.12, wrapZ(b.z, renderZ));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.78 + Math.sin(time * 9 + b.z) * 0.06 + (Math.sin(time * 37 + b.z) > 0.97 ? -0.4 : 0);
    }
    const tex = this.floorMat.map!;
    tex.offset.y = renderZ / 8;
    this.floorMat.emissiveMap!.offset.y = renderZ / 8;
    const d = this.dummy;
    for (const loop of this.loops) {
      const { mesh, base } = loop;
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        d.position.set(b.x, b.y, wrapZ(b.z, renderZ));
        d.rotation.set(b.rot.x + b.spin * time, b.rot.y + b.spin * time * 0.7, b.rot.z);
        d.scale.copy(b.s);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.portalMat.uniforms.uTime.value = time;
    this.portalMat.uniforms.uBoost.value = boost;
    this.rings.forEach((ring, i) => (ring.rotation.z += dt * (0.15 + i * 0.1) * (i % 2 ? -1 : 1) * (1 + boost * 4)));
    this.stars.rotation.z = time * 0.002;
    if (this.boss && this.bossMode === 'event') {
      this.boss.position.y = -10 + Math.sin(time * 0.6) * 1.5;
      this.boss.rotation.y = Math.sin(time * 0.3) * 0.08;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
  }
}
