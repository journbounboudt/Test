import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SkinDef } from '@void-rush/shared';
import { glowTexture } from './textures';

export type RunnerPose = 'run' | 'idle' | 'down' | 'ult' | 'finish';

interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
}

/**
 * Procedural Void Runner: black segmented suit, orange luminous spine/core, streamlined helmet,
 * strong shoulders and bright boots — readable from behind on a small phone.
 */
export class RunnerModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly suit: THREE.MeshStandardMaterial;
  private readonly plate: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshStandardMaterial;
  private readonly visor: THREE.MeshStandardMaterial;
  private readonly thrusters: THREE.Sprite[] = [];
  private readonly coreGlow: THREE.Sprite;
  private phase = 0;
  lean = 0;

  constructor(skin: SkinDef) {
    this.suit = new THREE.MeshStandardMaterial({ color: skin.colors.suit, metalness: 0.55, roughness: 0.42 });
    this.plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin.colors.suit).multiplyScalar(1.6), metalness: 0.85, roughness: 0.22 });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: skin.colors.trim, emissiveIntensity: 2.6, metalness: 0, roughness: 1 });
    this.visor = new THREE.MeshStandardMaterial({ color: skin.colors.visor, metalness: 1, roughness: 0.08, emissive: skin.colors.trim, emissiveIntensity: 0.08 });

    const box = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      return o;
    };

    this.root.add(this.body);
    this.body.position.y = 1.0;

    // Pelvis
    this.body.add(mesh(box(0.42, 0.22, 0.28), this.suit, 0, 0, 0));
    this.body.add(mesh(box(0.44, 0.05, 0.3, 0.02), this.trim, 0, 0.1, 0));

    // Torso (pivot at waist)
    this.torso.position.y = 0.1;
    this.body.add(this.torso);
    this.torso.add(mesh(box(0.36, 0.26, 0.24), this.suit, 0, 0.16, 0));
    const chest = mesh(box(0.56, 0.36, 0.32, 0.08), this.plate, 0, 0.44, 0);
    this.torso.add(chest);
    // Backpack faces the camera (+z) and carries the signature spine light
    this.torso.add(mesh(box(0.34, 0.42, 0.14, 0.05), this.suit, 0, 0.42, 0.2));
    this.torso.add(mesh(box(0.07, 0.5, 0.03, 0.01), this.trim, 0, 0.34, 0.285));
    this.torso.add(mesh(box(0.2, 0.05, 0.03, 0.01), this.trim, 0, 0.58, 0.285));
    this.torso.add(mesh(box(0.05, 0.3, 0.03, 0.01), this.trim, -0.13, 0.42, 0.275));
    this.torso.add(mesh(box(0.05, 0.3, 0.03, 0.01), this.trim, 0.13, 0.42, 0.275));
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: skin.colors.trim, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.coreGlow.scale.set(0.9, 1.1, 1);
    this.coreGlow.position.set(0, 0.4, 0.34);
    this.torso.add(this.coreGlow);
    // Front chest V-core and abdominal plates
    for (const side of [-1, 1]) {
      const v = mesh(box(0.04, 0.26, 0.02, 0.01), this.trim, side * 0.08, 0.47, -0.165);
      v.rotation.z = side * 0.5;
      this.torso.add(v);
    }
    this.torso.add(mesh(box(0.09, 0.09, 0.03, 0.02), this.trim, 0, 0.38, -0.168));
    for (let i = 0; i < 3; i++) this.torso.add(mesh(box(0.28 - i * 0.03, 0.055, 0.04, 0.015), this.plate, 0, 0.26 - i * 0.075, -0.12));
    // Shoulders
    for (const s of [-1, 1]) {
      this.torso.add(mesh(box(0.26, 0.2, 0.3, 0.08), this.plate, s * 0.36, 0.58, 0));
      this.torso.add(mesh(box(0.2, 0.03, 0.28, 0.01), this.trim, s * 0.37, 0.69, 0));
    }

    // Head
    this.head.position.y = 0.8;
    this.torso.add(this.head);
    this.head.add(mesh(cap(0.07, 0.08), this.suit, 0, -0.08, 0));
    const helmet = mesh(new THREE.SphereGeometry(0.19, 20, 16), this.plate, 0, 0.06, 0);
    helmet.scale.set(1, 1.08, 1.18);
    this.head.add(helmet);
    const visor = mesh(new THREE.SphereGeometry(0.175, 20, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.32), this.visor, 0, 0.05, -0.02);
    visor.scale.set(1.05, 1.05, 1.22);
    this.head.add(visor);
    this.head.add(mesh(box(0.035, 0.03, 0.4, 0.01), this.trim, 0, 0.26, 0.0));
    this.head.add(mesh(box(0.2, 0.025, 0.03, 0.01), this.trim, 0, 0.02, 0.22));
    const slit = mesh(box(0.2, 0.022, 0.03, 0.01), this.trim, 0, 0.07, -0.205);
    this.head.add(slit);

    // Arms
    const makeArm = (side: number): Limb => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 0.56, 0);
      this.torso.add(pivot);
      pivot.add(mesh(cap(0.075, 0.22), this.suit, 0, -0.17, 0));
      const lower = new THREE.Group();
      lower.position.y = -0.33;
      pivot.add(lower);
      lower.add(mesh(cap(0.07, 0.2), this.plate, 0, -0.14, 0));
      lower.add(mesh(box(0.05, 0.16, 0.05, 0.01), this.trim, side * 0.06, -0.14, 0.02));
      lower.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), this.suit, 0, -0.3, 0));
      return { pivot, lower };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    // Legs
    const makeLeg = (side: number): Limb => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, -0.08, 0);
      this.body.add(pivot);
      pivot.add(mesh(cap(0.1, 0.28), this.suit, 0, -0.2, 0));
      pivot.add(mesh(box(0.05, 0.22, 0.04, 0.01), this.trim, side * 0.09, -0.2, 0.03));
      const lower = new THREE.Group();
      lower.position.y = -0.42;
      pivot.add(lower);
      lower.add(mesh(cap(0.085, 0.28), this.plate, 0, -0.2, 0));
      lower.add(mesh(box(0.14, 0.12, 0.08, 0.03), this.plate, 0, 0.0, -0.07));
      lower.add(mesh(box(0.06, 0.03, 0.02, 0.01), this.trim, 0, 0.0, -0.115));
      lower.add(mesh(box(0.03, 0.2, 0.03, 0.01), this.trim, side * 0.075, -0.22, -0.02));
      const boot = mesh(box(0.17, 0.14, 0.32, 0.05), this.suit, 0, -0.43, -0.05);
      lower.add(boot);
      lower.add(mesh(box(0.18, 0.03, 0.33, 0.01), this.trim, 0, -0.5, -0.05));
      lower.add(mesh(box(0.1, 0.06, 0.03, 0.01), this.trim, 0, -0.43, 0.12));
      const thr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: skin.colors.trail, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      thr.position.set(0, -0.44, 0.2);
      thr.scale.set(0.35, 0.35, 1);
      lower.add(thr);
      this.thrusters.push(thr);
      return { pivot, lower };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  setSkin(skin: SkinDef) {
    this.suit.color.set(skin.colors.suit);
    this.plate.color.set(skin.colors.suit).multiplyScalar(1.6);
    this.trim.emissive.set(skin.colors.trim);
    this.visor.color.set(skin.colors.visor);
    this.visor.emissive.set(skin.colors.trim);
    this.coreGlow.material.color.set(skin.colors.trim);
    for (const t of this.thrusters) t.material.color.set(skin.colors.trail);
  }

  setOpacity(o: number) {
    for (const m of [this.suit, this.plate, this.trim, this.visor]) {
      m.transparent = o < 1;
      m.opacity = o;
    }
  }

  /** `speed` in m/s drives cadence; `dt` is real seconds (scaled for slow-mo). */
  update(dt: number, pose: RunnerPose, speed: number, time: number) {
    const b = this.body;
    const t = this.torso;
    if (pose === 'run' || pose === 'ult' || pose === 'finish') {
      const cadence = 1.35 + speed * 0.028;
      this.phase += dt * cadence;
      const a = this.phase * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const stride = pose === 'ult' ? 1.05 : 0.85;
      this.legL.pivot.rotation.x = s * stride;
      this.legR.pivot.rotation.x = -s * stride;
      this.legL.lower.rotation.x = -Math.max(0, -c) * 1.5 - 0.15;
      this.legR.lower.rotation.x = -Math.max(0, c) * 1.5 - 0.15;
      this.armL.pivot.rotation.x = -s * 0.9;
      this.armR.pivot.rotation.x = s * 0.9;
      this.armL.lower.rotation.x = 1.3;
      this.armR.lower.rotation.x = 1.3;
      this.armL.pivot.rotation.z = -0.12;
      this.armR.pivot.rotation.z = 0.12;
      b.position.y = 1.0 + Math.abs(c) * 0.07;
      t.rotation.x = pose === 'ult' ? -0.5 : -0.24;
      t.rotation.y = s * 0.12;
      this.head.rotation.x = pose === 'ult' ? 0.35 : 0.16;
    } else if (pose === 'idle') {
      const br = Math.sin(time * 1.6);
      this.legL.pivot.rotation.x = 0.05;
      this.legR.pivot.rotation.x = -0.05;
      this.legL.lower.rotation.x = -0.08;
      this.legR.lower.rotation.x = -0.08;
      this.armL.pivot.rotation.set(0.08, 0, -0.18 - br * 0.02);
      this.armR.pivot.rotation.set(0.08, 0, 0.18 + br * 0.02);
      this.armL.lower.rotation.x = 0.25;
      this.armR.lower.rotation.x = 0.25;
      b.position.y = 1.0 + br * 0.012;
      t.rotation.set(-0.03 + br * 0.01, 0, 0);
      this.head.rotation.set(0, Math.sin(time * 0.5) * 0.12, 0);
    } else if (pose === 'down') {
      this.legL.pivot.rotation.x = 1.2;
      this.legR.pivot.rotation.x = 0.4;
      this.legL.lower.rotation.x = -1.6;
      this.legR.lower.rotation.x = -1.2;
      this.armL.pivot.rotation.x = -1.4;
      this.armR.pivot.rotation.x = -1.1;
      this.armL.lower.rotation.x = -0.4;
      this.armR.lower.rotation.x = -0.4;
      b.position.y = THREE.MathUtils.lerp(b.position.y, 0.55, Math.min(1, dt * 8));
      t.rotation.x = THREE.MathUtils.lerp(t.rotation.x, -0.9, Math.min(1, dt * 8));
    }
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, -this.lean * 0.32, Math.min(1, dt * 12));
    this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, this.lean * 0.18, Math.min(1, dt * 12));
    const flicker = 0.75 + Math.sin(time * 40) * 0.12;
    for (const thr of this.thrusters) {
      const k = pose === 'ult' ? 1.8 : pose === 'run' || pose === 'finish' ? 1 : 0.4;
      thr.scale.setScalar(0.35 * k * flicker);
    }
    this.trim.emissiveIntensity = pose === 'ult' ? 4 : 2.6;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of [this.suit, this.plate, this.trim, this.visor]) m.dispose();
  }
}
