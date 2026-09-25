import { ChevronLeft, Play, Plus, ShoppingCart, Star as StarLucide, X, Home as HomeIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Price, RewardBundle } from '@void-rush/shared';
import { audio } from '../audio/audio';
import { tg } from '../platform/telegram';
import { useStore, type Screen } from '../state/store';
import { Bolt, Coin, CurrencyIcon, Helmet, Shard, StarIcon, TgStar } from './icons';
import { clock, fmt, rewardEntries } from './format';

export function click() {
  audio.unlock();
  audio.sfx('click');
  tg.haptic('light');
}

export function Cta({ children, onClick, disabled, loading, variant, small, className }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; variant?: 'blue' | 'purple'; small?: boolean; className?: string }) {
  return (
    <button
      className={`cta-wrap ${variant ?? ''} ${className ?? ''}`}
      disabled={disabled || loading}
      onClick={() => {
        click();
        onClick?.();
      }}
    >
      <span className={`cta ${small ? 'small' : ''}`}>
        <span className="chev">››</span>
        {loading ? <span className="spinner" /> : <span>{children}</span>}
        <span className="chev">›</span>
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
  return (
    <header className="topbar">
      <button
        className="row"
        style={{ gap: 8 }}
        onClick={() => {
          click();
          openModal({ type: 'settings' });
        }}
        aria-label="Профиль и настройки"
      >
        <span className="avatar-wrap">
          <Avatar url={p.avatarUrl} name={p.displayName} skin={p.selectedSkin} />
          <span className="lvl-dot">{p.level}</span>
        </span>
        <div className="who" style={{ textAlign: 'left' }}>
          <b>{p.displayName}</b>
          <span>Ур. {p.level}</span>
          <div className="bar">
            <i style={{ width: `${Math.min(100, (p.xp / p.xpToNext) * 100)}%` }} />
          </div>
        </div>
      </button>
      <div className="pills">
        <button
          className="pill"
          onClick={() => {
            click();
            openModal({ type: 'energy' });
          }}
          aria-label="Энергия"
        >
          <Bolt />
          <span className="num">
            {energy.value}/{energy.cap}
          </span>
          <span className="plus">
            <Plus size={12} strokeWidth={3} />
          </span>
          {energy.next > 0 && <span className="timer">{clock(energy.next)}</span>}
        </button>
        <button className="pill" onClick={() => openShop('energy')} aria-label="Кредиты">
          <Coin />
          <span className="num">{compactPill(p.balances.credits)}</span>
          <span className="plus">
            <Plus size={12} strokeWidth={3} />
          </span>
        </button>
        <button
          className="pill"
          onClick={() => {
            click();
            openModal({ type: 'shards' });
          }}
          aria-label="Осколки"
        >
          <Shard />
          <span className="num">{compactPill(p.balances.shards)}</span>
          <span className="plus">
            <Plus size={12} strokeWidth={3} />
          </span>
        </button>
        <button className="pill" onClick={() => openShop('stars')} aria-label="Звёзды">
          <StarIcon />
          <span className="num">{compactPill(p.balances.stars)}</span>
          <span className="plus">
            <Plus size={12} strokeWidth={3} />
          </span>
        </button>
      </div>
    </header>
  );
}

function compactPill(n: number) {
  if (n >= 100000) return `${Math.floor(n / 1000)}K`;
  return fmt(n);
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

export function BackBar({ title, right }: { title?: string; right?: ReactNode }) {
  const back = useStore((s) => s.back);
  return (
    <div className="row" style={{ margin: '4px 0 6px' }}>
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

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <div className="logo" style={{ fontSize: size }}>
      <span className="logo-void">
        V<span className="logo-o" />
        ID
      </span>
      <span className="logo-rush">RUSH</span>
    </div>
  );
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
