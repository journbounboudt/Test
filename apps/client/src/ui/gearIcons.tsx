import type { GearSlot } from '@void-rush/shared';

/** Illustrated equipment icons for the six gear slots. */
export function GearIcon({ slot, size = 56 }: { slot: GearSlot; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 64 64', className: 'gear-icon' } as const;
  switch (slot) {
    case 'suit':
      return (
        <svg {...common}>
          <path d="M20 10h24l8 8-4 10v24H16V28l-4-10z" fill="url(#g-dark)" stroke="#5a6f9a" strokeWidth="1.2" />
          <path d="M26 12h12l-2 14h-8z" fill="#0b0f1c" />
          <path d="M31 16h2v24h-2z" fill="#ff8a1f" style={{ filter: 'drop-shadow(0 0 4px #ff8a1f)' }} />
          <path d="M18 30h10M36 30h10M20 40h8M36 40h8" stroke="#ff8a1f" strokeWidth="1.6" style={{ filter: 'drop-shadow(0 0 3px #ff8a1f)' }} />
        </svg>
      );
    case 'core':
      return (
        <svg {...common}>
          <path d="M32 6 54 19v26L32 58 10 45V19z" fill="url(#g-dark)" stroke="#5a6f9a" strokeWidth="1.2" />
          <circle cx="32" cy="32" r="13" fill="#ff8a1f" style={{ filter: 'drop-shadow(0 0 8px #ff8a1f)' }} />
          <circle cx="32" cy="32" r="7" fill="#ffe0a0" />
          <path d="M32 12v6M32 46v6M14 22l5 3M45 39l5 3M14 42l5-3M45 25l5-3" stroke="#ff9a3a" strokeWidth="2" />
        </svg>
      );
    case 'boots':
      return (
        <svg {...common}>
          <path d="M8 38c0-6 4-10 8-12l6-14h10l-2 16 12 4c6 2 10 6 10 12v4H8z" fill="url(#g-dark)" stroke="#5a6f9a" strokeWidth="1.2" />
          <path d="M8 50h44" stroke="#35d7ff" strokeWidth="3" style={{ filter: 'drop-shadow(0 0 5px #35d7ff)' }} />
          <path d="M18 34h14M34 34l8 3" stroke="#ff8a1f" strokeWidth="1.8" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M32 6 54 19v26L32 58 10 45V19z" fill="url(#g-dark)" stroke="#6ac8ff" strokeWidth="1.5" />
          <path d="M32 14 46 22v20L32 50 18 42V22z" fill="url(#g-cyan)" fillOpacity=".85" style={{ filter: 'drop-shadow(0 0 6px #35d7ff)' }} />
          <path d="M32 18v28M22 26l10 6 10-6" stroke="#e8fbff" strokeWidth="1.2" fill="none" opacity=".7" />
        </svg>
      );
    case 'magnet':
      return (
        <svg {...common}>
          <path d="M12 10h12v22a8 8 0 0 0 16 0V10h12v22a20 20 0 0 1-40 0z" fill="#d2303a" stroke="#ff9aa0" strokeWidth="1.2" />
          <path d="M12 10h12v8H12zM40 10h12v8H40z" fill="#c8d4e8" />
          <path d="M24 44c4 3 12 3 16 0" stroke="#fff" strokeOpacity=".4" strokeWidth="2" fill="none" />
        </svg>
      );
    case 'boost':
      return (
        <svg {...common}>
          <rect x="18" y="8" width="28" height="48" rx="6" fill="url(#g-dark)" stroke="#6ac8ff" strokeWidth="1.3" />
          <rect x="22" y="16" width="20" height="32" rx="3" fill="#35d7ff" fillOpacity=".3" />
          <path d="M35 18 26 34h6l-3 12 10-17h-6z" fill="url(#g-bolt)" style={{ filter: 'drop-shadow(0 0 5px #35d7ff)' }} />
          <rect x="24" y="4" width="16" height="6" rx="2" fill="#8aa2c8" />
        </svg>
      );
  }
}
