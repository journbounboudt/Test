import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './common';

type Mote = { x: number; y: number; z: number; r: number; vx: number; vy: number; tw: number; hue: number };
type Streak = { x: number; y: number; len: number; v: number; life: number };

/**
 * Living menu backdrop on a 2D canvas (spec §5: no WebGL behind menus): depth-layered drifting
 * motes with twinkle, rare void streaks and scroll parallax. Capped at ~30 fps, paused when hidden.
 */
export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = prefersReducedMotion();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    const streaks: Streak[] = [];
    const spawn = (y?: number): Mote => {
      const z = Math.random();
      return {
        x: Math.random() * w,
        y: y ?? Math.random() * h,
        z,
        r: 0.5 + z * 1.5,
        vx: (Math.random() - 0.5) * 3,
        vy: -(3 + z * 12),
        tw: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.55 ? 195 : Math.random() < 0.75 ? 268 : 38,
      };
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 5200));
      motes = Array.from({ length: count }, () => spawn());
    };
    resize();

    const draw = (dt: number) => {
      const scroll = window.scrollY;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.tw += dt * (1 + m.z * 2);
        if (m.y < -10) Object.assign(m, spawn(h + 10));
        if (m.x < -10) m.x = w + 10;
        if (m.x > w + 10) m.x = -10;
        const span = h + 20;
        const py = ((((m.y - scroll * (0.08 + m.z * 0.22)) % span) + span) % span) - 10;
        const a = (0.22 + m.z * 0.5) * (0.6 + 0.4 * Math.sin(m.tw));
        if (m.z > 0.84) {
          const g = ctx.createRadialGradient(m.x, py, 0, m.x, py, m.r * 5);
          g.addColorStop(0, `hsla(${m.hue}, 100%, 80%, ${a * 0.8})`);
          g.addColorStop(1, `hsla(${m.hue}, 100%, 60%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(m.x, py, m.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `hsla(${m.hue}, 90%, 86%, ${a})`;
        ctx.beginPath();
        ctx.arc(m.x, py, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still && streaks.length < 2 && Math.random() < dt * 0.12) {
        streaks.push({ x: w * (0.3 + Math.random() * 0.8), y: Math.random() * h * 0.5, len: 60 + Math.random() * 90, v: 380 + Math.random() * 240, life: 1 });
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.x -= s.v * dt * 0.8;
        s.y += s.v * dt * 0.45;
        s.life -= dt * 0.9;
        if (s.life <= 0) {
          streaks.splice(i, 1);
          continue;
        }
        const tx = s.x + s.len * 0.87;
        const ty = s.y - s.len * 0.5;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        g.addColorStop(0, `rgba(200, 244, 255, ${0.7 * s.life})`);
        g.addColorStop(1, 'rgba(120, 90, 255, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      acc += dt;
      if (acc < 1 / 30) return;
      draw(acc);
      acc = 0;
    };
    if (still) draw(0);
    else raf = requestAnimationFrame(frame);

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const onResize = () => {
      resize();
      if (still) draw(0);
    };
    const onScroll = () => {
      if (still) draw(0);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <canvas ref={ref} className="menu-backdrop" aria-hidden />;
}
