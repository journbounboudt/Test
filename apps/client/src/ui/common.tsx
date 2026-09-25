import { ChevronLeft, Play, Plus, ShoppingCart, Star as StarLucide, X, Home as HomeIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Price, RewardBundle } from '@void-rush/shared';
import { audio } from '../audio/audio';
import { tg } from '../platform/telegram';
import { useStore, type Screen } from '../state/store';
import { Bolt, Coin, CurrencyIcon, Helmet, Shard, StarIcon, TgStar } from './icons';
import { clock, fmt, rewardEntries, short } from './format';

export function click() {
  audio.unlock();
  audio.sfx('click');
  tg.haptic('light');
}

function Chevrons({ n = 1, className }: { n?: 1 | 2; className?: string }) {
  return (
    <svg className={`cta-chev ${className ?? ''}`} viewBox={n === 2 ? '0 0 26 24' : '0 0 14 24'} aria-hidden>
      <path d="M2 3.5 10.5 12 2 20.5" />
      {n === 2 && <path d="M13 3.5 21.5 12 13 20.5" />}
    </svg>
  );
}

/** Hero hex call-to-action: glowing bevel rim, gradient core, chevrons, idle shimmer. */
export function Cta({ children, onClick, disabled, loading, variant, small, className, icon }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; variant?: 'blue' | 'purple'; small?: boolean; className?: string; icon?: ReactNode }) {
  return (
    <button
      className={`cta-wrap ${variant ?? ''} ${small ? 'small' : ''} ${loading ? 'is-loading' : ''} ${className ?? ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={() => {
        click();
        onClick?.();
      }}
    >
      <span className="cta-rim">
        <span className={`cta ${small ? 'small' : ''}`}>
          {icon ? <span className="cta-icon">{icon}</span> : <Chevrons n={2} className="l" />}
          <span className="cta-label">{loading ? <span className="spinner" /> : children}</span>
          <Chevrons className="r" />
          <span className="cta-shine" aria-hidden />
        </span>
      </span>
    </button>
  );
}

export function Btn({ children, onClick, disabled, loading, variant, size, block, className, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; variant?: 'gold' | 'violet' | 'cyan' | 'green' | 'ghost' | 'danger'; size?: 'sm'; block?: boolean; className?: string; title?: string }) {
  return (
    <button
      title={title}
      className={`btn ${variant ?? ''} ${size ?? ''} ${block ? 'block' : ''} ${className ?? ''}`}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        click();
        onClick?.();
      }}
    >
      {loading ? <span className="spinner" /> : children}
    </button>
  );
}

export function PriceTag({ price, label }: { price: Price; label?: string }) {
  if (price.type === 'xtr') {
    return (
      <span className="row" style={{ gap: 4 }}>
        <TgStar size={16} />
        <span className="num">{fmt(price.amount)}</span>
        {label && <span className="muted" style={{ fontSize: 11 }}>{label}</span>}
      </span>
    );
  }
  if (price.type === 'fragments') {
    return (
      <span className="row" style={{ gap: 4 }}>
        <CurrencyIcon kind="skinFragments" size={16} />
        <span className="num">{price.amount}</span>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 4 }}>
      <CurrencyIcon kind={price.currency} size={16} />
      <span className="num">{fmt(price.amount)}</span>
    </span>
  );
}

export function Avatar({ url, name, skin, size }: { url?: string | null; name: string; skin?: string; size?: 'sm' }) {
  const [failed, setFailed] = useState(false);
  const skinArt = skin ? `/art/avatar-${skin}.webp` : null;
  const src = !failed ? url || skinArt : skin && url ? skinArt : null;
  return (
    <div className={`avatar ${size ?? ''}`}>
      {src ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <div className="avatar-fallback" style={{ background: `linear-gradient(135deg, hsl(${(name.charCodeAt(0) * 37) % 360} 70% 40%), #0b1224)` }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function useEnergyTimer() {
  const profile = useStore((s) => s.profile);
  const at = useStore((s) => s.profileAt);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!profile) return { value: 0, cap: 30, next: 0 };
  const { value, cap, nextInSec, regenSec } = profile.energy;
  if (value >= cap || nextInSec <= 0) return { value, cap, next: 0 };
  const elapsed = (Date.now() - at) / 1000;
  let v = value;
  let next = nextInSec - elapsed;
  while (next <= 0 && v < cap) {
    v++;
    next += regenSec;
  }
  return { value: v, cap, next: v >= cap ? 0 : next };
}

/** Animated number that eases from its previous value; jumps instantly under reduced motion. */
export function useCountUp(target: number, ms = 700): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || prefersReducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(k >= 1 ? target : v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return Math.round(shown);
}

export function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts up to `value`; `format` controls rendering. Flashes when the value grows. */
export function CountUp({ value, format = fmt, ms, className }: { value: number; format?: (n: number) => string; ms?: number; className?: string }) {
  const n = useCountUp(value, ms);
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (value > prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);
  return (
    <span key={bump} className={`num ${bump ? 'bump' : ''} ${className ?? ''}`}>
      {format(n)}
    </span>
  );
}

function Pill({ icon, value, label, onClick, timer, kind }: { icon: ReactNode; value: ReactNode; label: string; onClick: () => void; timer?: string; kind: string }) {
  return (
    <button className={`pill ${kind}`} onClick={onClick} aria-label={label}>
      <span className="pill-ico">{icon}</span>
      <span className="pill-num">{value}</span>
      <span className="plus" aria-hidden>
        <Plus size={11} strokeWidth={3.2} />
      </span>
      {timer && <span className="timer num">{timer}</span>}
    </button>
  );
}

export function TopBar() {
  const p = useStore((s) => s.profile);
  const openModal = useStore((s) => s.openModal);
  const navigate = useStore((s) => s.navigate);
  const energy = useEnergyTimer();
  if (!p) return null;
  const openShop = (tab: 'stars' | 'energy') => {
    click();
    useStore.setState({ shopTab: tab });
    navigate('shop');
  };
  const xpPct = Math.max(0, Math.min(100, (p.xp / Math.max(1, p.xpToNext)) * 100));
  return (
    <header className="topbar">
      <button
        className="tb-profile"
        onClick={() => {
          click();
          openModal({ type: 'settings' });
        }}
        aria-label={`${p.displayName}, уровень ${p.level}. Профиль и настройки`}
      >
        <span className="avatar-wrap" style={{ '--xp': `${xpPct}%` } as React.CSSProperties}>
          <Avatar url={p.avatarUrl} name={p.displayName} skin={p.selectedSkin} />
          <span className="lvl-dot num">{p.level}</span>
        </span>
        <span className="who">
          <b>{p.displayName}</b>
          <span>Ур. {p.level}</span>
          <span className="bar">
            <i style={{ width: `${xpPct}%` }} />
          </span>
        </span>
      </button>
      <div className="pills">
        <Pill
          kind="energy"
          icon={<Bolt size={20} />}
          value={
            <>
              <CountUp value={energy.value} format={short} />
              {energy.value <= energy.cap && <span className="pill-cap">/{energy.cap}</span>}
            </>
          }
          label={`Энергия ${energy.value} из ${energy.cap}`}
          timer={energy.next > 0 ? clock(energy.next) : undefined}
          onClick={() => {
            click();
            openModal({ type: 'energy' });
          }}
        />
        <Pill kind="credits" icon={<Coin size={20} />} value={<CountUp value={p.balances.credits} format={short} />} label="Кредиты" onClick={() => openShop('energy')} />
        <Pill
          kind="shards"
          icon={<Shard size={20} />}
          value={<CountUp value={p.balances.shards} format={short} />}
          label="Осколки"
          onClick={() => {
            click();
            openModal({ type: 'shards' });
          }}
        />
        <Pill kind="stars" icon={<StarIcon size={20} />} value={<CountUp value={p.balances.stars} format={short} />} label="Звёзды" onClick={() => openShop('stars')} />
      </div>
    </header>
  );
}

const NAV: { screen: Screen; label: string; icon: ReactNode }[] = [
  { screen: 'home', label: 'Главная', icon: <HomeIcon fill="currentColor" strokeWidth={1.5} /> },
  { screen: 'routes', label: 'Забег', icon: <Play fill="currentColor" strokeWidth={1.5} /> },
  { screen: 'gear', label: 'Снаряжение', icon: <Helmet size={26} /> },
  { screen: 'shop', label: 'Магазин', icon: <ShoppingCart strokeWidth={2} /> },
  { screen: 'pass', label: 'Пропуск', icon: <StarLucide fill="currentColor" strokeWidth={1.5} /> },
];

export function BottomNav() {
  const screen = useStore((s) => s.screen);
  const history = useStore((s) => s.history);
  const navigate = useStore((s) => s.navigate);
  const badges = useStore((s) => s.profile?.badges);
  const active = NAV.some((n) => n.screen === screen) ? screen : [...history].reverse().find((h) => NAV.some((n) => n.screen === h)) ?? 'home';
  return (
    <nav className="bottom-nav">
      {NAV.map((n) => (
        <button
          key={n.screen}
          className={`nav-item ${active === n.screen ? 'on' : ''}`}
          onClick={() => {
            click();
            navigate(n.screen);
          }}
        >
          <span className="ic">
            {n.icon}
            {n.screen === 'shop' && badges?.shop && <i className="badge-dot" />}
            {n.screen === 'pass' && badges?.pass && <i className="badge-dot" />}
          </span>
          {n.label}
        </button>
      ))}
    </nav>
  );
}

/** In-app back: Telegram shows its native BackButton, so this floats only outside Telegram. */
export function BackBar({ title, right }: { title?: string; right?: ReactNode }) {
  const back = useStore((s) => s.back);
  if (tg.available && !title && !right) return null;
  return (
    <div className={title || right ? 'back-row' : 'back-float'}>
      <button
        className="icon-btn"
        onClick={() => {
          click();
          back();
        }}
        aria-label="Назад"
      >
        <ChevronLeft size={22} />
      </button>
      {title && <div className="h-section grow">{title}</div>}
      {right}
    </div>
  );
}

export function Modal({ children, onClose, tone, wide }: { children: ReactNode; onClose?: () => void; tone?: 'cyan' | 'violet' | 'gold' | 'red'; wide?: boolean }) {
  return (
    <div className="overlay" onClick={() => onClose?.()}>
      <div className={`modal panel ${tone ?? 'cyan'}`} style={wide ? { maxWidth: 460 } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        {onClose && (
          <button
            className="icon-btn modal-close"
            onClick={() => {
              click();
              onClose();
            }}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function RewardList({ bundle, size = 18, column }: { bundle: RewardBundle; size?: number; column?: boolean }) {
  const cfg = useStore((s) => s.config);
  return (
    <div className={column ? 'col' : 'row'} style={{ gap: column ? 6 : 10, flexWrap: 'wrap' }}>
      {rewardEntries(bundle).map((e) => (
        <span key={e.key} className="row" style={{ gap: 4 }}>
          <CurrencyIcon kind={e.key} size={size} />
          <span className="num">{e.key === 'skin' ? cfg?.skins.find((s) => s.id === e.skin)?.name ?? 'Скин' : e.key === 'premiumPass' ? 'Премиум' : `${e.key === 'passXp' || e.key === 'xp' ? '+' : ''}${fmt(e.amount)}`}</span>
        </span>
      ))}
    </div>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Server-time aware countdown. */
export function useServerNow() {
  const serverTime = useStore((s) => s.profile?.serverTime ?? Date.now());
  const at = useStore((s) => s.profileAt || Date.now());
  const now = useNow();
  return serverTime + (now - at);
}

export function Img({ src, className, style, alt = '' }: { src: string; className?: string; style?: React.CSSProperties; alt?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className={className} style={style} />;
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" onError={() => setOk(false)} />;
}

/** VOID RUSH wordmark: chrome "V◯ID" with a spinning portal O, cyan brush "RUSH" with speed flicks. */
export function Logo({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <div className={`logo ${className ?? ''}`} style={{ fontSize: size }} role="img" aria-label="VOID RUSH">
      <span className="logo-void" aria-hidden>
        <span className="logo-chrome">V</span>
        <span className="logo-o">
          <i />
        </span>
        <span className="logo-chrome">ID</span>
      </span>
      <span className="logo-rush" aria-hidden>
        <span className="logo-rush-text">RUSH</span>
        <svg className="logo-flicks" viewBox="0 0 60 40">
          <path d="M8 38 L44 4 L46 5 L12 38 Z" />
          <path d="M24 38 L56 10 L57 11.5 L28 38 Z" />
          <path d="M40 20 L58 2 L58.6 3 L42 20 Z" />
        </svg>
      </span>
    </div>
  );
}

/** Light parallax for hero art: translates the element as the page scrolls. */
export function useParallax<T extends HTMLElement>(factor = 0.25) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      if (el) el.style.transform = `translate3d(0, ${Math.min(240, window.scrollY) * factor}px, 0) scale(1.06)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [factor]);
  return ref;
}

export function ScreenArt({ src, height, children, position = 'center', fade = true }: { src: string; height: number; children?: ReactNode; position?: string; fade?: boolean }) {
  return (
    <div className="screen-art" style={{ height }}>
      <Img src={src} className="screen-art-img" style={{ objectPosition: position }} />
      {fade && <div className="screen-art-fade" />}
      <div className="screen-art-content">{children}</div>
    </div>
  );
}
