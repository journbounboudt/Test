import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; srgb?: boolean } = {}) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Track surface: dark metal panels with lane dividers. One tile = 8 m of track. */
export function floorTexture(key: string, base: number, line: number, edge: number) {
  return canvasTexture(`floor-${key}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);
    const laneW = w / 3.6;
    const x0 = (w - laneW * 3) / 2;
    for (let lane = 0; lane < 3; lane++) {
      for (let row = 0; row < 4; row++) {
        const x = x0 + lane * laneW + 6;
        const y = row * (h / 4) + 6;
        const g = ctx.createLinearGradient(x, y, x + laneW, y + h / 4);
        g.addColorStop(0, 'rgba(255,255,255,0.05)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, laneW - 12, h / 4 - 12);
        ctx.strokeStyle = 'rgba(120,160,255,0.10)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, laneW - 12, h / 4 - 12);
      }
    }
    ctx.globalAlpha = 0.9;
    for (let i = 1; i < 3; i++) {
      const x = x0 + i * laneW;
      for (let y = 0; y < h; y += 64) {
        ctx.fillStyle = hex(line);
        ctx.fillRect(x - 2, y + 8, 4, 40);
      }
    }
    ctx.fillStyle = hex(edge);
    ctx.fillRect(x0 - 8, 0, 6, h);
    ctx.fillRect(x0 + laneW * 3 + 2, 0, 6, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, x0 - 10, h);
    ctx.fillRect(x0 + laneW * 3 + 10, 0, w, h);
  }, { repeat: true });
}

/** Emissive mask for the floor (only the glowing lines). */
export function floorEmissive(key: string, line: number, edge: number) {
  return canvasTexture(`floorE-${key}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const laneW = w / 3.6;
    const x0 = (w - laneW * 3) / 2;
    ctx.fillStyle = hex(line);
    for (let i = 1; i < 3; i++) for (let y = 0; y < h; y += 64) ctx.fillRect(x0 + i * laneW - 2, y + 8, 4, 40);
    ctx.fillStyle = hex(edge);
    ctx.fillRect(x0 - 8, 0, 6, h);
    ctx.fillRect(x0 + laneW * 3 + 2, 0, 6, h);
  }, { repeat: true });
}

/** Cube face with a glowing red X (Blocker Cube). */
export function blockerFace(withX: boolean) {
  return canvasTexture(`blocker-${withX}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0b0c12';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff3b2f';
    ctx.shadowColor = '#ff5a1f';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    if (withX) {
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(70, 70);
      ctx.lineTo(w - 70, h - 70);
      ctx.moveTo(w - 70, 70);
      ctx.lineTo(70, h - 70);
      ctx.stroke();
    }
  });
}

export function hazardStripes() {
  return canvasTexture('stripes', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#120806';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff5a1f';
    for (let x = -h; x < w + h; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 20, h);
      ctx.lineTo(x + 20 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
    ctx.strokeStyle = '#ff2a1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  }, { repeat: true });
}

export function glowTexture() {
  return canvasTexture('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function windowsTexture(key: string, color: number) {
  return canvasTexture(`windows-${key}`, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 6; y < h; y += 14) {
      for (let x = 6; x < w; x += 18) {
        if (rnd() < 0.28) {
          ctx.globalAlpha = 0.35 + rnd() * 0.65;
          ctx.fillStyle = hex(color);
          ctx.fillRect(x, y, 10, 5);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex(color);
    ctx.fillRect(0, 0, 3, h);
  }, { repeat: true });
}

export function skyTexture(key: string, top: number, mid: number, bottom: number) {
  return canvasTexture(`sky-${key}`, 8, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(top));
    g.addColorStop(0.55, hex(mid));
    g.addColorStop(1, hex(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function nebulaTexture() {
  return canvasTexture('nebula', 256, 256, (ctx, w, h) => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 38; i++) {
      const x = w / 2 + (rnd() - 0.5) * w * 0.6;
      const y = h / 2 + (rnd() - 0.5) * h * 0.6;
      const r = 30 + rnd() * 80;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.05 + rnd() * 0.08})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });
}

export function ringTexture() {
  return canvasTexture('ring', 128, 128, (ctx, w, h) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function scanTexture() {
  return canvasTexture('scan', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = `rgba(255,255,255,${y % 16 === 0 ? 0.9 : 0.4})`;
      ctx.fillRect(0, y, w, 3);
    }
  }, { repeat: true });
}

export function hexGridTexture() {
  return canvasTexture('hexgrid', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    const r = 18;
    for (let row = -1; row < 10; row++) {
      for (let col = -1; col < 10; col++) {
        const cx = col * r * 1.5;
        const cy = row * r * Math.sqrt(3) + (col % 2 ? (r * Math.sqrt(3)) / 2 : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }, { repeat: true });
}
