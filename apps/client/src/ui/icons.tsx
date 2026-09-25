import type { CSSProperties, ReactNode } from 'react';

/** Shared gradients referenced by the custom icons (defined once to keep ids unique). */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="g-bolt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8f4ff" />
          <stop offset=".5" stopColor="#35d7ff" />
          <stop offset="1" stopColor="#1a74ff" />
        </linearGradient>
        <radialGradient id="g-coin" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".45" stopColor="#ffc53d" />
          <stop offset="1" stopColor="#c46a00" />
        </radialGradient>
        <linearGradient id="g-shard" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0dcff" />
          <stop offset=".45" stopColor="#b07bff" />
          <stop offset="1" stopColor="#5a24d6" />
        </linearGradient>
        <linearGradient id="g-star" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset=".5" stopColor="#ffc53d" />
          <stop offset="1" stopColor="#ff8a00" />
        </linearGradient>
        <linearGradient id="g-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3ccff" />
          <stop offset="1" stopColor="#7a3cff" />
        </linearGradient>
        <linearGradient id="g-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9f6ff" />
          <stop offset="1" stopColor="#1a8cff" />
        </linearGradient>
        <linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb0a0" />
          <stop offset="1" stopColor="#ff3d2a" />
        </linearGradient>
        <linearGradient id="g-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3550" />
          <stop offset="1" stopColor="#0b0f1c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type P = { size?: number; className?: string; style?: CSSProperties };
const svg = (children: ReactNode, { size = 20, className, style }: P, glow?: string) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={`ico ${className ?? ''}`} style={{ filter: glow ? `drop-shadow(0 0 4px ${glow})` : undefined, ...style }} aria-hidden>
    {children}
  </svg>
);

export const Bolt = (p: P) => svg(<path d="M13.5 1.5 4 13.2h6.1L8.8 22.5 20 9.6h-6.3z" fill="url(#g-bolt)" stroke="#e8fbff" strokeWidth=".6" />, p, 'rgba(53,215,255,.8)');
export const Coin = (p: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" fill="url(#g-coin)" stroke="#fff0a8" strokeWidth=".8" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#a85a00" strokeOpacity=".55" strokeWidth="1.2" />
      <path d="M14.8 9.2c-.6-.8-1.6-1.3-2.8-1.3-2.1 0-3.6 1.7-3.6 4.1s1.5 4.1 3.6 4.1c1.2 0 2.2-.5 2.8-1.3" fill="none" stroke="#7a3c00" strokeWidth="1.8" strokeLinecap="round" />
    </>,
    p,
    'rgba(255,190,60,.6)',
  );
export const Shard = (p: P) =>
  svg(
    <>
      <path d="M12 1.5 18.5 9 12 22.5 5.5 9z" fill="url(#g-shard)" stroke="#f3e6ff" strokeWidth=".7" />
      <path d="M12 1.5 9.4 9 12 22.5 14.6 9z" fill="#fff" fillOpacity=".25" />
    </>,
    p,
    'rgba(176,107,255,.8)',
  );
export const StarIcon = (p: P) => svg(<path d="m12 1.8 3 6.4 7 .9-5.2 4.8 1.4 6.9L12 17.3l-6.2 3.5 1.4-6.9L2 9.1l7-.9z" fill="url(#g-star)" stroke="#fff4c4" strokeWidth=".6" />, p, 'rgba(255,190,60,.7)');
export const TgStar = (p: P) => svg(<path d="m12 2.5 2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.6l-5.6 3.1 1.3-6.3-4.8-4.3 6.4-.7z" fill="#ffd23f" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />, p);
export const Crown = (p: P) => svg(<path d="M3 18h18l1-11-5.5 4L12 4.5 7.5 11 2 7zM3.5 20h17" fill="url(#g-star)" stroke="#fff1b0" strokeWidth=".8" strokeLinejoin="round" />, p, 'rgba(255,190,60,.7)');
export const ShieldIcon = (p: P) => svg(<path d="M12 2 20 5v6.5c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5V5z" fill="url(#g-cyan)" stroke="#dff8ff" strokeWidth=".8" />, p, 'rgba(53,215,255,.8)');
export const MagnetIcon = (p: P) => svg(<path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0zM5 3v3.5h4M15 6.5h4" fill="url(#g-violet)" stroke="#f0e2ff" strokeWidth=".8" strokeLinejoin="round" />, p, 'rgba(176,107,255,.8)');
export const BoostIcon = (p: P) => svg(<path d="m12 3 8 7h-5l-3-2.6L9 10H4zm0 7 8 7h-5l-3-2.6L9 17H4z" fill="url(#g-star)" stroke="#fff1b0" strokeWidth=".6" />, p, 'rgba(255,170,40,.8)');
export const ReviveIcon = (p: P) =>
  svg(
    <>
      <path d="M12 1.8 21 7v10l-9 5.2L3 17V7z" fill="url(#g-violet)" stroke="#efe0ff" strokeWidth=".8" />
      <path d="M12 7.5v9M7.5 12h9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </>,
    p,
    'rgba(176,107,255,.8)',
  );
export const Trophy = (p: P) => svg(<path d="M7 3h10v4a5 5 0 0 1-10 0zM7 5H3.5c0 3 1.5 4.5 3.8 4.8M17 5h3.5c0 3-1.5 4.5-3.8 4.8M12 12v4M8 21h8l-1-5H9z" fill="url(#g-star)" stroke="#fff1b0" strokeWidth=".8" strokeLinejoin="round" />, p, 'rgba(255,190,60,.6)');
export const Flame = (p: P) => svg(<path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.8c0-2 1-3.6 2.4-4.8.2 2 1.2 3 2.2 3.3C11 8.5 11 5 12 2z" fill="url(#g-red)" stroke="#ffd0b0" strokeWidth=".6" />, p, 'rgba(255,110,40,.8)');
export const Gift = (p: P) => svg(<path d="M3 9h18v4H3zM4.5 13h15v8h-15zM12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z" fill="url(#g-star)" stroke="#fff1b0" strokeWidth=".7" strokeLinejoin="round" />, p, 'rgba(255,190,60,.6)');
export const Chest = (p: P) =>
  svg(
    <>
      <path d="M3 10h18v10H3z" fill="url(#g-dark)" stroke="#6a86c0" strokeWidth=".8" />
      <path d="M3 10c0-4 3-6 9-6s9 2 9 6z" fill="url(#g-dark)" stroke="#6a86c0" strokeWidth=".8" />
      <path d="M10 11h4v4h-4z" fill="url(#g-star)" />
      <path d="M3 13h18" stroke="#ffc53d" strokeWidth=".8" />
    </>,
    p,
    'rgba(255,190,60,.5)',
  );
export const Chip = (p: P) =>
  svg(
    <>
      <rect x="5" y="5" width="14" height="14" rx="2.5" fill="url(#g-violet)" stroke="#efe0ff" strokeWidth=".8" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="#c9a6ff" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="#fff" fillOpacity=".5" />
    </>,
    p,
    'rgba(176,107,255,.7)',
  );
export const Xp = (p: P) =>
  svg(
    <>
      <rect x="2" y="4" width="20" height="16" rx="4" fill="url(#g-cyan)" fillOpacity=".25" stroke="#35d7ff" strokeWidth="1.2" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="900" fontStyle="italic" fill="#bff3ff" fontFamily="Exo 2, sans-serif">
        XP
      </text>
    </>,
    p,
    'rgba(53,215,255,.6)',
  );
export const Fragment = (p: P) =>
  svg(
    <>
      <path d="M12 2.5c4.4 0 7.5 3 7.5 7.4 0 2.6-1 4.4-2.6 5.6l-1 5H8.1l-1-5C5.5 14.3 4.5 12.5 4.5 9.9c0-4.4 3.1-7.4 7.5-7.4z" fill="url(#g-dark)" stroke="#9fdcff" strokeWidth=".8" />
      <path d="M6.8 9.5h10.4l-1.2 3H8z" fill="url(#g-cyan)" />
      <path d="m14 3 2 3-2.5 1.5" stroke="#fff" strokeWidth="1" fill="none" />
    </>,
    p,
    'rgba(160,220,255,.6)',
  );
export const Mystery = (p: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" fill="url(#g-dark)" stroke="#8aa2c8" strokeWidth=".8" />
      <path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.6M12 17.4v.2" stroke="#dfe8ff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>,
    p,
  );
export const Runner = (p: P) =>
  svg(
    <path d="M14 3.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0zM9.5 7.5l4-1 2.5 3.5 3 1-.6 1.6-3.8-1.2-1.3-1.7-1 3.3 2.7 2.3-.8 5.7h-1.8l.5-4.7-3-2.2-1.4 3.2-4.5 1-.4-1.7 3.4-.8 2.4-6.3-1.6.5-1.3 2.6-1.6-.8z" fill="url(#g-cyan)" />,
    p,
    'rgba(53,215,255,.6)',
  );
export const Target = (p: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="url(#g-cyan)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="url(#g-cyan)" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="#35d7ff" strokeWidth="1.8" strokeLinecap="round" />
    </>,
    p,
    'rgba(53,215,255,.6)',
  );
export const Hourglass = (p: P) => svg(<path d="M6 2.5h12M6 21.5h12M7 2.5c0 5 5 6 5 9.5s-5 4.5-5 9.5M17 2.5c0 5-5 6-5 9.5s5 4.5 5 9.5" fill="none" stroke="url(#g-cyan)" strokeWidth="1.8" strokeLinecap="round" />, p, 'rgba(53,215,255,.6)');
export const Helmet = (p: P) =>
  svg(
    <>
      <path d="M12 2c5 0 8.5 3.5 8.5 8.5 0 3.2-1.4 5.6-3.4 7.1L16 22H8l-1.1-4.4C4.9 16.1 3.5 13.7 3.5 10.5 3.5 5.5 7 2 12 2z" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 10h11l-1.5 3.5H8z" fill="currentColor" />
    </>,
    p,
  );
export const Portal = (p: P) =>
  svg(
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="url(#g-violet)" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="url(#g-cyan)" strokeWidth="1.4" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="3" fill="#fff" fillOpacity=".8" />
    </>,
    p,
    'rgba(155,92,255,.7)',
  );

export const Road = (p: P) =>
  svg(
    <>
      <path d="M9 2.5 3 21.5h7.2L11 16h2l.8 5.5H21L15 2.5z" fill="url(#g-cyan)" opacity=".35" />
      <path d="M9 2.5 3 21.5M15 2.5l6 19M12 3v3M12 9v3.5M12 16v4" stroke="url(#g-cyan)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>,
    p,
    'rgba(53,215,255,.6)',
  );
export const Stopwatch = (p: P) =>
  svg(
    <>
      <circle cx="12" cy="13.5" r="8" fill="none" stroke="url(#g-cyan)" strokeWidth="1.8" />
      <path d="M12 13.5V9M9.5 2.5h5M12 2.5v3M18.5 6l1.5-1.5" stroke="url(#g-cyan)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>,
    p,
    'rgba(53,215,255,.5)',
  );
export const PassCard = (p: P) =>
  svg(
    <>
      <rect x="4.5" y="2" width="15" height="20" rx="2.2" fill="url(#g-dark)" stroke="url(#g-star)" strokeWidth="1.4" />
      <rect x="6.6" y="4.1" width="10.8" height="15.8" rx="1.2" fill="none" stroke="#ffc53d" strokeOpacity=".45" strokeWidth=".6" />
      <path d="M7.8 14.2h8.4l.6-5.4-2.8 2-2-3.2-2 3.2-2.8-2z" fill="url(#g-star)" stroke="#fff1b0" strokeWidth=".5" strokeLinejoin="round" />
      <path d="M8 16h8" stroke="#ffc53d" strokeWidth=".9" />
    </>,
    p,
    'rgba(255,180,50,.8)',
  );
export const Battery = (p: P) =>
  svg(
    <>
      <rect x="9" y="1.5" width="6" height="2.5" rx=".8" fill="#9fb6d8" />
      <rect x="5.5" y="3.6" width="13" height="19" rx="2.6" fill="url(#g-dark)" stroke="#bfe9ff" strokeWidth="1.1" />
      <rect x="7.4" y="5.6" width="9.2" height="15" rx="1.6" fill="#0a2a55" />
      <path d="M13.2 7 8.6 14h3.1l-1 5.4 4.8-7.4h-3.2z" fill="url(#g-bolt)" stroke="#e8fbff" strokeWidth=".4" />
    </>,
    p,
    'rgba(53,215,255,.8)',
  );

export function CurrencyIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  switch (kind) {
    case 'credits':
      return <Coin size={size} />;
    case 'shards':
      return <Shard size={size} />;
    case 'stars':
      return <StarIcon size={size} />;
    case 'energy':
      return <Bolt size={size} />;
    case 'reviveTokens':
      return <ReviveIcon size={size} />;
    case 'skinFragments':
      return <Fragment size={size} />;
    case 'xp':
      return <Xp size={size} />;
    case 'passXp':
      return <Crown size={size} />;
    case 'premiumPass':
      return <Crown size={size} />;
    case 'skin':
      return <Helmet size={size} style={{ color: '#c07bff' }} />;
    case 'module':
      return <Chip size={size} />;
    case 'fragment':
      return <Fragment size={size} />;
    case 'mystery':
      return <Mystery size={size} />;
    case 'pass':
      return <Crown size={size} />;
    default:
      return <StarIcon size={size} />;
  }
}
