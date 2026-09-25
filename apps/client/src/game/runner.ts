import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SkinDef } from '@void-rush/shared';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { glowTexture } from './textures';
import { runnerAsset, type RunnerAsset } from './runnerAsset';

export type RunnerPose = 'run' | 'idle' | 'down' | 'ult' | 'finish';

interface RunnerImpl {
  readonly root: THREE.Group;
  lean: number;
  update(dt: number, pose: RunnerPose, speed: number, time: number): void;
  setSkin(skin: SkinDef): void;
  setOpacity(o: number): void;
  holdClip?(name: string, time: number): boolean;
  glow?: number;
  dispose(): void;
}

/**
 * The Void Runner hero. Uses the rigged GLB (tools/blender/build_runner.py) when `loadRunnerAsset()`
 * has resolved, otherwise the procedural model, so construction stays synchronous and never throws.
 */
export class RunnerModel {
  readonly root: THREE.Group;
  private readonly impl: RunnerImpl;

  constructor(skin: SkinDef) {
    const asset = runnerAsset();
    let impl: RunnerImpl | null = null;
    if (asset) {
      try {
        impl = new SkinnedRunner(asset, skin);
      } catch (err) {
        console.warn('[runner] GLB runner failed, using procedural fallback', err);
      }
    }
    this.impl = impl ?? new ProceduralRunner(skin);
    this.root = this.impl.root;
  }

  get lean() {
    return this.impl.lean;
  }
  set lean(v: number) {
    this.impl.lean = v;
  }

  /** `speed` in m/s drives cadence; `dt` is real seconds (scaled for slow-mo). */
  update(dt: number, pose: RunnerPose, speed: number, time: number) {
    this.impl.update(dt, pose, speed, time);
  }
  setSkin(skin: SkinDef) {
    this.impl.setSkin(skin);
  }
  /**
   * Trim emissive multiplier. The default suits bloomed scenes (the run); views without bloom (the Gear
   * viewer) lower it so the orange stays saturated instead of clipping to yellow.
   */
  set glow(k: number) {
    this.impl.glow = k;
  }
  /** Freezes a named clip (e.g. 'Victory') at `time` seconds for stills; false on the procedural fallback. */
  holdClip(name: string, time: number) {
    return this.impl.holdClip?.(name, time) ?? false;
  }
  setOpacity(o: number) {
    this.impl.setOpacity(o);
  }
  dispose() {
    this.impl.dispose();
  }
}

/** Cycle lengths of the authored clips (s) — used to turn stride cadence into a timeScale. */
const RUN_CYCLE = 24 / 30;
const SPRINT_CYCLE = 20 / 30;
const FADE: Record<string, number> = { Run: 0.2, Sprint: 0.22, Idle: 0.35, Fall: 0.1 };

const PLATE_TINT = new THREE.Color(0x2d333e);
const WHITE = new THREE.Color(0xffffff);
const RIM_COLOR = new THREE.Color(0x8aa2ff);
const plateColor = (suit: string, out: THREE.Color) => out.set(suit).lerp(PLATE_TINT, 0.3);
/** Emissive colour with extra saturation: ACES pushes hot orange toward yellow, this keeps the skin hue. */
const glowColor = (hex: string, out: THREE.Color) => {
  out.set(hex);
  const max = Math.max(out.r, out.g, out.b, 1e-4);
  out.setRGB(max * (out.r / max) ** 1.6, max * (out.g / max) ** 1.6, max * (out.b / max) ** 1.6);
  return out;
};
/** Authored model height (m); used to express bind-pose positions in metres for the roughness noise. */
const MODEL_HEIGHT = 1.93;

interface ArmorLook {
  /** Strength of the cool fresnel edge light. */
  rim: number;
  rimPower: number;
  /** Amplitude of the roughness breakup (satin vs. polished patches). */
  rough: number;
  /** How strongly the baked vertex AO also occludes environment reflections. */
  specOcclusion: number;
}

/**
 * Patches a MeshStandardMaterial with: a fresnel rim (keeps near-black armour readable in any scene),
 * roughness breakup keyed to bind-pose position (sticks to the surface while skinned), and specular
 * occlusion from the baked vertex AO so crevices don't reflect the environment.
 */
function armorShader(mat: THREE.MeshStandardMaterial, look: ArmorLook) {
  const uniforms = {
    uRimColor: { value: RIM_COLOR },
    uRim: { value: look.rim },
    uRimPower: { value: look.rimPower },
    uRoughAmp: { value: look.rough },
    uSpecOcc: { value: look.specOcclusion },
    uPosScale: { value: 1 },
  };
  mat.userData.armor = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArmorPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArmorPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vArmorPos;
uniform vec3 uRimColor;
uniform float uRim, uRimPower, uRoughAmp, uSpecOcc, uPosScale;
float armorHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float armorNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(armorHash(i), armorHash(i + vec3(1, 0, 0)), f.x), mix(armorHash(i + vec3(0, 1, 0)), armorHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(armorHash(i + vec3(0, 0, 1)), armorHash(i + vec3(1, 0, 1)), f.x), mix(armorHash(i + vec3(0, 1, 1)), armorHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
vec3 armorP = vArmorPos * uPosScale;
float armorN = armorNoise(armorP * 9.0) * 0.65 + armorNoise(armorP * 33.0) * 0.35;
roughnessFactor = clamp(roughnessFactor + (armorN - 0.5) * uRoughAmp, 0.05, 1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float armorFres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), uRimPower);
totalEmissiveRadiance += uRimColor * armorFres * uRim;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
#ifdef USE_COLOR
reflectedLight.indirectSpecular *= mix(1.0, vColor.r, uSpecOcc);
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'void-rush-armor';
}

class SkinnedRunner implements RunnerImpl {
  readonly root = new THREE.Group();
  lean = 0;
  glow = 1;
  private readonly pivot = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly strafeL: THREE.AnimationAction | null;
  private readonly strafeR: THREE.AnimationAction | null;
  private readonly skinned: THREE.SkinnedMesh[] = [];
  private readonly suit: THREE.MeshStandardMaterial;
  private readonly plate: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshStandardMaterial;
  private readonly visor: THREE.MeshStandardMaterial;
  private readonly mats: THREE.MeshStandardMaterial[];
  private readonly thrusters: THREE.Sprite[] = [];
  private readonly thrusterCores: THREE.Sprite[] = [];
  private readonly backGlow: THREE.Sprite;
  private readonly frontGlow: THREE.Sprite;
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private leanS = 0;
  private strafeW = 0;
  private ultK = 0;

  constructor(asset: RunnerAsset, skin: SkinDef) {
    this.model = cloneSkinned(asset.gltf.scene);
    // Near-black satin plates over a matte undersuit: the trim glow and cool rim do the work.
    this.suit = new THREE.MeshStandardMaterial({ name: 'Suit', metalness: 0.12, roughness: 0.74, envMapIntensity: 0.9 });
    this.plate = new THREE.MeshStandardMaterial({ name: 'Plate', metalness: 0.55, roughness: 0.38, envMapIntensity: 1.25 });
    this.trim = new THREE.MeshStandardMaterial({ name: 'Trim', color: 0x000000, emissiveIntensity: 1.7, metalness: 0, roughness: 1 });
    this.visor = new THREE.MeshStandardMaterial({ name: 'Visor', metalness: 1, roughness: 0.05, envMapIntensity: 1.5, emissiveIntensity: 0 });
    armorShader(this.plate, { rim: 0.28, rimPower: 3, rough: 0.28, specOcclusion: 0.85 });
    armorShader(this.suit, { rim: 0.16, rimPower: 3.5, rough: 0.2, specOcclusion: 0.9 });
    armorShader(this.visor, { rim: 0.22, rimPower: 2.5, rough: 0, specOcclusion: 0.5 });
    this.mats = [this.suit, this.plate, this.trim, this.visor];
    const byName: Record<string, THREE.MeshStandardMaterial> = { Suit: this.suit, Plate: this.plate, Trim: this.trim, Visor: this.visor };
    this.model.traverse((o) => {
      o.frustumCulled = false;
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      const mat = byName[name] ?? this.suit;
      mesh.material = mat;
      const armor = mat.userData.armor as { uPosScale: { value: number } } | undefined;
      if (armor && name !== 'Visor') {
        // Positions may be quantized (gltfpack); the body-spanning primitives calibrate them to metres.
        mesh.geometry.computeBoundingBox();
        const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
        armor.uPosScale.value = MODEL_HEIGHT / Math.max(size.x, size.y, size.z, 1e-6);
      }
      if (mesh.isSkinnedMesh) this.skinned.push(mesh);
      // COLOR_0 carries baked ambient occlusion (seams between plates and undersuit).
      if (mesh.geometry.getAttribute('color')) for (const m of this.mats) m.vertexColors = true;
    });
    this.root.add(this.pivot);
    this.pivot.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of asset.clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'Fall' || name === 'Victory') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    const strafe = (name: string) => {
      const a = this.actions.get(name);
      if (!a) return null;
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      a.paused = true;
      a.time = a.getClip().duration;
      a.setEffectiveWeight(0);
      return a;
    };
    this.strafeL = strafe('StrafeL');
    this.strafeR = strafe('StrafeR');

    const glow = (color: string, opacity: number) =>
      new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    const find = (name: string) => this.model.getObjectByName(name) ?? this.model.getObjectByName(name.replace('.', ''));
    for (const side of ['L', 'R']) {
      const anchor = find(`thruster.${side}`);
      if (!anchor) continue;
      const halo = glow(skin.colors.trail, 0.85);
      const core = glow('#ffffff', 0.9);
      anchor.add(halo, core);
      this.thrusters.push(halo);
      this.thrusterCores.push(core);
    }
    this.backGlow = glow(skin.colors.trim, 0.5);
    this.backGlow.scale.set(0.55, 0.95, 1);
    (find('core.back') ?? this.model).add(this.backGlow);
    this.frontGlow = glow(skin.colors.trim, 0.35);
    this.frontGlow.scale.set(0.26, 0.26, 1);
    (find('core.front') ?? this.model).add(this.frontGlow);
    // Sprites under bones inherit the armature's unit scale; keep them from being culled with the rig.
    for (const s of [...this.thrusters, ...this.thrusterCores, this.backGlow, this.frontGlow]) s.frustumCulled = false;

    this.setSkin(skin);
  }

  private play(name: string, fade: number) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    const prev = this.current;
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    if (prev && (name === 'Run' || name === 'Sprint') && (this.currentName === 'Run' || this.currentName === 'Sprint')) {
      // Keep the stride phase when switching between run and sprint.
      next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
    }
    next.play();
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    this.current = next;
    this.currentName = name;
  }

  holdClip(name: string, time: number) {
    const action = this.actions.get(name);
    if (!action) return false;
    for (const a of this.actions.values()) if (a !== this.strafeL && a !== this.strafeR) a.stop();
    action.reset().play();
    action.time = Math.min(time, action.getClip().duration);
    action.paused = true;
    this.mixer.update(0);
    this.current = action;
    this.currentName = name;
    return true;
  }

  update(dt: number, pose: RunnerPose, speed: number, time: number) {
    const name =
      pose === 'run' ? 'Run' : pose === 'ult' || pose === 'finish' ? 'Sprint' : pose === 'down' ? 'Fall' : 'Idle';
    if (name !== this.currentName) this.play(name, this.current ? FADE[name] ?? 0.2 : 0);
    const cadence = 1.35 + speed * 0.028;
    if (this.current) {
      if (name === 'Run') this.current.timeScale = THREE.MathUtils.clamp(cadence * RUN_CYCLE, 0.7, 2.4);
      else if (name === 'Sprint') this.current.timeScale = THREE.MathUtils.clamp(cadence * 1.08 * SPRINT_CYCLE, 0.8, 2.6);
      else this.current.timeScale = 1;
    }

    const k = Math.min(1, dt * 10);
    const running = name === 'Run' || name === 'Sprint';
    this.leanS += ((running ? this.lean : 0) - this.leanS) * k;
    this.strafeW += (Math.min(1, Math.abs(this.leanS) * 1.4) - this.strafeW) * k;
    if (this.strafeL) this.strafeL.setEffectiveWeight(this.leanS < 0 ? this.strafeW : 0);
    if (this.strafeR) this.strafeR.setEffectiveWeight(this.leanS > 0 ? this.strafeW : 0);
    this.mixer.update(dt);

    this.pivot.rotation.z = -this.leanS * 0.14;
    this.pivot.rotation.y = -this.leanS * 0.22;

    this.ultK += ((pose === 'ult' ? 1 : 0) - this.ultK) * Math.min(1, dt * 4);
    const flicker = 0.82 + Math.sin(time * 43) * 0.1 + Math.sin(time * 71) * 0.08;
    const thrust = pose === 'idle' ? 0.35 : pose === 'down' ? 0.12 : 1 + this.ultK * 0.9;
    for (const s of this.thrusters) s.scale.setScalar(0.34 * thrust * flicker);
    for (const s of this.thrusterCores) s.scale.setScalar(0.1 * thrust * (0.9 + flicker * 0.2));
    const pulse = 0.5 + 0.5 * Math.sin(time * (3 + this.ultK * 6));
    this.backGlow.material.opacity = 0.42 + pulse * 0.12 + this.ultK * 0.25;
    this.frontGlow.material.opacity = 0.28 + pulse * 0.1;
    this.trim.emissiveIntensity = (2.1 + pulse * 0.25 + this.ultK * 1.3) * this.glow;
  }

  setSkin(skin: SkinDef) {
    this.suit.color.set(skin.colors.suit).multiplyScalar(0.45);
    plateColor(skin.colors.suit, this.plate.color);
    glowColor(skin.colors.trim, this.trim.emissive);
    this.visor.color.set(skin.colors.visor);
    this.backGlow.material.color.set(skin.colors.trim);
    this.frontGlow.material.color.set(skin.colors.trim);
    for (const s of this.thrusters) s.material.color.set(skin.colors.trail);
    for (const s of this.thrusterCores) s.material.color.set(skin.colors.trail).lerp(WHITE, 0.6);
  }

  setOpacity(o: number) {
    for (const m of this.mats) {
      const t = o < 1;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = o;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    // Geometry is shared with the cached GLB; only per-instance resources are released.
    for (const m of this.mats) m.dispose();
    for (const s of [...this.thrusters, ...this.thrusterCores, this.backGlow, this.frontGlow]) s.material.dispose();
    for (const m of this.skinned) m.skeleton.dispose();
    this.root.removeFromParent();
  }
}


interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
}

/**
 * Procedural fallback runner (used only if the GLB failed to load): black segmented suit, orange
 * luminous spine/core, streamlined helmet, strong shoulders and bright boots.
 */
class ProceduralRunner implements RunnerImpl {
  readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
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

    this.root.add(this.pivot);
    this.pivot.add(this.body);
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
    this.pivot.rotation.z = THREE.MathUtils.lerp(this.pivot.rotation.z, -this.lean * 0.32, Math.min(1, dt * 12));
    this.pivot.rotation.y = THREE.MathUtils.lerp(this.pivot.rotation.y, -this.lean * 0.18, Math.min(1, dt * 12));
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
