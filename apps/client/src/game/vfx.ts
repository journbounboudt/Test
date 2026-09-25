import * as THREE from 'three';
import { glowTexture, hexGridTexture } from './textures';

const particleVert = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
void main() {
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const particleFrag = /* glsl */ `
varying float vAlpha; varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * vAlpha * 1.6, a * vAlpha);
}`;

/** Fixed-size particle pool; no allocations after construction. */
export class Particles {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly anchored: Uint8Array;
  private cursor = 0;
  private readonly tmp = new THREE.Color();

  constructor(n: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.anchored = new Uint8Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({ vertexShader: particleVert, fragmentShader: particleFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
  }

  /** `anchored` particles live in world space and scroll with the track. */
  emit(x: number, y: number, z: number, count: number, color: number, opts: { speed?: number; life?: number; size?: number; gravity?: number; anchored?: boolean; spread?: number; vz?: number } = {}) {
    this.tmp.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const sp = (opts.speed ?? 4) * (0.4 + Math.random() * 0.8);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const s = opts.spread ?? 0.2;
      this.pos[i * 3] = x + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * s;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp + (opts.vz ?? 0);
      this.col[i * 3] = this.tmp.r;
      this.col[i * 3 + 1] = this.tmp.g;
      this.col[i * 3 + 2] = this.tmp.b;
      this.maxLife[i] = this.life[i] = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.baseSize[i] = (opts.size ?? 0.35) * (0.6 + Math.random() * 0.8);
      this.gravity[i] = opts.gravity ?? 6;
      this.anchored[i] = opts.anchored === false ? 0 : 1;
    }
  }

  /** Particles spawned on a ring that fly inwards (magnet pull, charge-up). */
  emitRing(x: number, y: number, z: number, radius: number, count: number, color: number, inward: number, life = 0.35) {
    this.tmp.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a) * 0.8;
      this.pos[i * 3] = x + cx * radius;
      this.pos[i * 3 + 1] = y + cy * radius;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.vel[i * 3] = -cx * inward;
      this.vel[i * 3 + 1] = -cy * inward;
      this.vel[i * 3 + 2] = 0;
      this.col[i * 3] = this.tmp.r;
      this.col[i * 3 + 1] = this.tmp.g;
      this.col[i * 3 + 2] = this.tmp.b;
      this.maxLife[i] = this.life[i] = life * (0.7 + Math.random() * 0.5);
      this.baseSize[i] = 0.22 + Math.random() * 0.12;
      this.gravity[i] = 0;
      this.anchored[i] = 0;
    }
  }

  update(dt: number, dz: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt + (this.anchored[i] ? dz : 0);
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + t * 0.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}

/** Ribbon of light following the Runner's lateral history. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly segs = 30;
  private readonly hist: { z: number; x: number }[] = [];
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(color: number | string) {
    this.geo = new THREE.BufferGeometry();
    const n = this.segs + 1;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < this.segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    const c = this.geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i <= this.segs; i++) {
      const f = Math.pow(1 - i / this.segs, 3) * 0.5;
      c.setXYZ(i * 2, f, f, f);
      c.setXYZ(i * 2 + 1, f, f, f);
    }
  }

  setColor(c: number | string) {
    this.mat.color.set(c);
  }

  update(renderZ: number, x: number, width: number, y: number) {
    this.hist.unshift({ z: renderZ, x });
    if (this.hist.length > 90) this.hist.length = 90;
    const p = this.geo.attributes.position as THREE.BufferAttribute;
    let h = 0;
    for (let i = 0; i <= this.segs; i++) {
      const back = i * 0.16;
      const target = renderZ - back;
      while (h < this.hist.length - 1 && this.hist[h].z > target) h++;
      const px = this.hist[h]?.x ?? x;
      const w = width * (1 - i / this.segs);
      p.setXYZ(i * 2, px - w, y, back + 0.3);
      p.setXYZ(i * 2 + 1, px + w, y, back + 0.3);
    }
    p.needsUpdate = true;
  }
}

const fresnelVert = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const fresnelFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform sampler2D uHex; uniform float uHit;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){
  float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
  float hex = texture2D(uHex, vUv * vec2(6.0, 3.0) + vec2(0.0, uTime * 0.08)).r;
  float scan = smoothstep(0.96, 1.0, sin(vUv.y * 40.0 - uTime * 5.0) * 0.5 + 0.5);
  float a = f * 0.9 + hex * (0.16 + f * 0.5) + scan * 0.12 + uHit * 0.6;
  gl_FragColor = vec4(uColor * a * 1.7 * uOpacity, a * uOpacity);
}`;

export class Fields {
  readonly group = new THREE.Group();
  readonly shield: THREE.Mesh;
  private readonly shieldMat: THREE.ShaderMaterial;
  readonly magnet: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly speedLines: THREE.InstancedMesh;
  private readonly lineData: { x: number; y: number; z: number; len: number }[] = [];
  private readonly ultRings: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly speedMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly aura: THREE.Sprite;
  private readonly magnetRing2: THREE.Mesh;
  private readonly padGlow: THREE.Sprite;

  constructor(accent: number, accent2: number) {
    this.shieldMat = new THREE.ShaderMaterial({
      vertexShader: fresnelVert,
      fragmentShader: fresnelFrag,
      uniforms: { uColor: { value: new THREE.Color(0x4cc9ff) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uHex: { value: hexGridTexture() }, uHit: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 20), this.shieldMat);
    this.shield.position.y = 1.1;
    this.shield.scale.set(1, 1.25, 1);
    this.group.add(this.shield);
    this.magnet = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.05, 6, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc07bff).multiplyScalar(2), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.magnet.rotation.x = -Math.PI / 2;
    this.magnet.position.y = 0.1;
    this.group.add(this.magnet);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    this.speedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.speedLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), this.speedMat, 48);
    this.speedLines.frustumCulled = false;
    for (let i = 0; i < 48; i++) this.lineData.push(this.randomLine(-Math.random() * 80));
    this.group.add(this.speedLines);

    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent2).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ultRings = new THREE.InstancedMesh(new THREE.TorusGeometry(5.5, 0.08, 6, 40), this.ringMat, 10);
    this.ultRings.frustumCulled = false;
    this.group.add(this.ultRings);

    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa32a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.aura.position.y = 1.1;
    this.aura.scale.set(3.2, 3.8, 1);
    this.group.add(this.aura);
    this.magnetRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.03, 6, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc07bff).multiplyScalar(1.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.magnetRing2.rotation.x = -Math.PI / 2;
    this.magnetRing2.position.y = 0.06;
    this.group.add(this.magnetRing2);
    this.padGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x35d7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.padGlow.position.y = 0.3;
    this.padGlow.scale.set(2.6, 1.2, 1);
    this.group.add(this.padGlow);
  }

  shieldHit() {
    this.shieldMat.uniforms.uHit.value = 1;
  }

  private randomLine(z: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 7;
    return { x: Math.cos(a) * r, y: 2 + Math.sin(a) * r * 0.6, z, len: 3 + Math.random() * 6 };
  }

  update(dt: number, time: number, s: { shield: number; boostShield: boolean; magnet: boolean; speedFx: number; ult: number; runnerX: number; dz: number; pad: number }) {
    this.shieldMat.uniforms.uTime.value = time;
    const hit = this.shieldMat.uniforms.uHit;
    hit.value = Math.max(0, hit.value - dt * 3);
    const am = this.aura.material;
    am.opacity += ((s.ult ? 0.55 + Math.sin(time * 18) * 0.1 : 0) - am.opacity) * Math.min(1, dt * 8);
    this.aura.visible = am.opacity > 0.01;
    this.aura.position.x = s.runnerX;
    this.magnetRing2.visible = s.magnet;
    (this.magnetRing2.material as THREE.MeshBasicMaterial).color.set(s.ult ? 0xffc35a : 0xc07bff).multiplyScalar(1.6);
    (this.magnet.material as THREE.MeshBasicMaterial).color.set(s.ult ? 0xffc35a : 0xc07bff).multiplyScalar(2);
    this.magnetRing2.position.x = s.runnerX;
    this.magnetRing2.scale.setScalar(1 + ((time * 1.5) % 1) * 0.8);
    (this.magnetRing2.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ((time * 1.5) % 1));
    const pm = this.padGlow.material;
    pm.opacity += (s.pad * 0.8 - pm.opacity) * Math.min(1, dt * 10);
    this.padGlow.visible = pm.opacity > 0.01;
    this.padGlow.position.x = s.runnerX;
    const targetOpacity = s.shield > 0 ? 1 : s.boostShield ? 0.1 : 0;
    const o = this.shieldMat.uniforms.uOpacity;
    o.value = THREE.MathUtils.lerp(o.value, targetOpacity, Math.min(1, dt * 10));
    this.shield.visible = o.value > 0.01;
    this.shield.position.x = s.runnerX;
    this.magnet.visible = s.magnet;
    this.magnet.position.x = s.runnerX;
    this.magnet.rotation.z = time * 4;
    this.magnet.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
    this.shadow.position.x = s.runnerX;

    const d = this.dummy;
    this.speedMat.opacity = THREE.MathUtils.lerp(this.speedMat.opacity, s.speedFx * 0.8, Math.min(1, dt * 5));
    for (let i = 0; i < this.lineData.length; i++) {
      const l = this.lineData[i];
      l.z += s.dz * 2.2 + dt * 30 * s.speedFx;
      if (l.z > 8) Object.assign(l, this.randomLine(-70 - Math.random() * 20));
      d.position.set(l.x, l.y, l.z);
      d.scale.set(1, 1, l.len * (0.4 + s.speedFx));
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.speedLines.setMatrixAt(i, d.matrix);
    }
    this.speedLines.instanceMatrix.needsUpdate = true;

    this.ringMat.opacity = THREE.MathUtils.lerp(this.ringMat.opacity, s.ult * 0.9, Math.min(1, dt * 6));
    this.ultRings.visible = this.ringMat.opacity > 0.02;
    if (this.ultRings.visible) {
      for (let i = 0; i < 10; i++) {
        const z = ((time * 60 + i * 9) % 90) - 80;
        d.position.set(0, 2.2, z);
        d.rotation.set(0, 0, time + i);
        d.scale.set(1.1, 0.8, 1);
        d.updateMatrix();
        this.ultRings.setMatrixAt(i, d.matrix);
      }
      this.ultRings.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Pooled expanding rings for impacts, pickups bursts, checkpoint and Ultimate. */
export class Shockwaves {
  readonly group = new THREE.Group();
  private readonly items: { mesh: THREE.Mesh; t: number; dur: number; size: number; anchored: boolean }[] = [];

  constructor(count = 10) {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.items.push({ mesh, t: 1, dur: 1, size: 1, anchored: false });
    }
  }

  /** `flat` rings lie on the floor; otherwise they face the camera (vertical, along the track). */
  spawn(x: number, y: number, z: number, color: number, size: number, dur: number, flat = false, anchored = false) {
    const it = this.items.reduce((a, b) => (b.t / b.dur > a.t / a.dur ? b : a));
    it.t = 0;
    it.dur = dur;
    it.size = size;
    it.anchored = anchored;
    it.mesh.position.set(x, y, z);
    it.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    (it.mesh.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(2);
    it.mesh.visible = true;
  }

  update(dt: number, dz: number) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const k = it.t / it.dur;
      if (k >= 1) {
        it.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      it.mesh.scale.setScalar(0.2 + e * it.size);
      if (it.anchored) it.mesh.position.z += dz;
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k);
    }
  }
}
