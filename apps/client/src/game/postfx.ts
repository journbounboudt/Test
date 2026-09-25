import * as THREE from 'three';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Speed/impact grading pass (runs in linear HDR, before OutputPass):
 * radial zoom blur towards the vanishing point, chromatic aberration at the edges,
 * and a tinted vignette that flashes red on hits, gold on Ultimate, cyan on shield breaks.
 */
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uCenter: { value: new THREE.Vector2(0.5, 0.56) },
    uBlur: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 0.35 },
    uTint: { value: new THREE.Color(0, 0, 0) },
    uTintAmt: { value: 0 },
    uWarp: { value: 0 },
    uTime: { value: 0 },
    uSamples: { value: 8 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uBlur, uAberration, uVignette, uTintAmt, uWarp, uTime;
    uniform int uSamples;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - uCenter;
      float r = length(d);
      // Portal distortion: a subtle swirl strongest mid-screen, used on hits and the Ultimate.
      float ang = uWarp * 0.35 * smoothstep(0.7, 0.0, r) * sin(uTime * 7.0 + r * 18.0);
      vec2 uv = uCenter + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
      vec2 dir = uv - uCenter;
      float edge = smoothstep(0.08, 0.75, r);
      vec3 acc = vec3(0.0);
      float tot = 0.0;
      for (int i = 0; i < 12; i++) {
        if (i >= uSamples) break;
        float t = float(i) / float(uSamples);
        vec2 o = dir * (1.0 - uBlur * edge * t * 0.09);
        float ca = uAberration * edge * 0.012;
        vec3 c;
        c.r = texture2D(tDiffuse, uCenter + o * (1.0 + ca)).r;
        c.g = texture2D(tDiffuse, uCenter + o).g;
        c.b = texture2D(tDiffuse, uCenter + o * (1.0 - ca)).b;
        float w = 1.0 - t * 0.6;
        acc += c * w;
        tot += w;
      }
      vec3 col = acc / tot;
      float vig = smoothstep(0.25, 0.95, r);
      col *= 1.0 - vig * uVignette;
      col = mix(col, col * 0.4 + uTint, vig * uTintAmt);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class SpeedPass {
  readonly pass: ShaderPass;
  private hit = 0;
  private tintTarget = new THREE.Color();
  private tintKick = 0;

  constructor(samples: number) {
    this.pass = new ShaderPass(SpeedShader);
    this.pass.uniforms.uSamples.value = samples;
  }

  get asPass(): Pass {
    return this.pass;
  }

  kick(kind: 'hit' | 'ult' | 'shield' | 'soft' | 'pad' | 'finish') {
    const colors: Record<typeof kind, number> = { hit: 0xff1a2a, ult: 0xffa32a, shield: 0x3ad0ff, soft: 0xff6a2a, pad: 0x35d7ff, finish: 0xffffff };
    this.tintTarget.set(colors[kind]);
    this.tintKick = kind === 'hit' ? 1 : kind === 'soft' || kind === 'pad' ? 0.45 : 0.75;
    if (kind === 'hit') this.hit = 1;
  }

  update(dt: number, time: number, s: { speed: number; ult: number; boost: number; reducedFlash: boolean }) {
    const u = this.pass.uniforms;
    const k = Math.min(1, dt * 6);
    const blurTarget = s.speed * 0.6 + s.boost * 0.7 + s.ult * 1.6;
    u.uBlur.value += (blurTarget - u.uBlur.value) * k;
    u.uAberration.value += (s.speed * 0.3 + s.ult * 1.2 + this.hit * 1.5 - u.uAberration.value) * k;
    this.tintKick = Math.max(0, this.tintKick - dt * 2.2);
    this.hit = Math.max(0, this.hit - dt * 1.6);
    const flash = s.reducedFlash ? 0.35 : 1;
    u.uTint.value.copy(this.tintTarget).multiplyScalar(0.55);
    u.uTintAmt.value = Math.max(this.tintKick, s.ult * 0.28) * flash;
    if (s.ult > 0 && this.tintKick < 0.3) u.uTint.value.set(0xffa32a).multiplyScalar(0.55);
    u.uWarp.value += (s.ult * 0.5 + this.hit - u.uWarp.value) * k;
    u.uVignette.value = 0.38 + s.ult * 0.15;
    u.uTime.value = time;
  }
}
