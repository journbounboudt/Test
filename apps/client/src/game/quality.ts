export type Tier = 'high' | 'medium' | 'low';

export interface QualityProfile {
  tier: Tier;
  pixelRatio: number;
  bloom: boolean;
  particles: number;
  rocks: number;
  buildings: number;
  stars: number;
  antialias: boolean;
}

export function profileFor(tier: Tier): QualityProfile {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  switch (tier) {
    case 'high':
      return { tier, pixelRatio: Math.min(dpr, 2), bloom: true, particles: 700, rocks: 70, buildings: 70, stars: 900, antialias: false };
    case 'medium':
      return { tier, pixelRatio: Math.min(dpr, 1.5), bloom: true, particles: 420, rocks: 44, buildings: 50, stars: 600, antialias: false };
    case 'low':
      return { tier, pixelRatio: Math.min(dpr, 1), bloom: false, particles: 220, rocks: 22, buildings: 32, stars: 300, antialias: false };
  }
}

/** First guess from device hints; the engine downgrades further if frame time is poor. */
export function detectTier(pref: 'auto' | Tier): Tier {
  if (pref !== 'auto') return pref;
  const stored = localStorage.getItem('vr_tier') as Tier | null;
  if (stored === 'high' || stored === 'medium' || stored === 'low') return stored;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    gpu = '';
  }
  if (/swiftshader|llvmpipe|software/.test(gpu)) return 'low';
  if (/mali-(4|t[0-9])|adreno \(tm\) (3|4|50)|powervr/.test(gpu) || cores <= 4 || mem <= 2) return 'low';
  if (/apple|adreno \(tm\) (6[4-9]|7)|mali-g7|mali-g6[1-9]|nvidia|radeon|intel/.test(gpu) && cores >= 6) return 'high';
  return 'medium';
}

export function rememberTier(t: Tier) {
  localStorage.setItem('vr_tier', t);
}
