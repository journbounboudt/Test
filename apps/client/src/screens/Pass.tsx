import { CalendarDays, Check, ChevronRight, Clock, Gift, Lock, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RewardBundle } from '@void-rush/shared';
import type { MissionView, PassView } from '../api/types';
import { track } from '../analytics';
import { claimMission, claimPass, fetchPass, handleError, setProfile } from '../state/actions';
import { useStore } from '../state/store';
import { Btn, Cta, Img, TopBar, click, useServerNow } from '../ui/common';
import { CurrencyIcon, Crown, Runner, Shard, Target, Bolt } from '../ui/icons';
import { compact, duration, fmt, rewardEntries } from '../ui/format';

export function RewardCell({ reward, state, onClaim, premium }: { reward: RewardBundle; state: 'claimed' | 'claimable' | 'locked' | 'future'; onClaim?: () => void; premium?: boolean }) {
  const e = rewardEntries(reward)[0];
  return (
    <button className={`reward-cell ${state} ${premium ? 'premium' : ''}`} onClick={state === 'claimable' ? onClaim : undefined} disabled={state !== 'claimable'}>
      {e?.key === 'skin' ? <Img src={`/art/skin-${e.skin}.webp`} className="cell-skin" /> : <CurrencyIcon kind={e?.key ?? 'stars'} size={30} />}
      {e && e.key !== 'skin' && e.key !== 'premiumPass' && <span className="num">{compact(e.amount)}</span>}
      {state === 'claimed' && (
        <i className="cell-check">
          <Check size={12} strokeWidth={4} />
        </i>
      )}
      {state === 'locked' && (
        <i className="cell-lock">
          <Lock size={11} />
        </i>
      )}
    </button>
  );
}

const METRIC_ICON: Record<string, React.ReactNode> = {
  shards: <Shard size={30} />,
  runs: <Runner size={30} />,
  maxCombo: <Target size={30} />,
  ultActivations: <Bolt size={30} />,
};

export function MissionRow({ m, period }: { m: MissionView; period: 'daily' | 'weekly' }) {
  const busy = useStore((s) => s.busy[`mission:${m.id}`]);
  const main = rewardEntries(m.reward).find((e) => e.key !== 'passXp') ?? rewardEntries(m.reward)[0];
  return (
    <div className={`panel mission ${m.claimable ? 'gold' : ''}`}>
      <div className="mission-ico">{METRIC_ICON[m.metric] ?? <Target size={30} />}</div>
      <div className="grow">
        <div className="mission-title">{m.title}</div>
        <div className="row" style={{ gap: 8 }}>
          <div className="bar grow">
            <i style={{ width: `${(m.progress / m.target) * 100}%` }} />
          </div>
          <span className="sub num">
            {compact(m.progress)} / {compact(m.target)}
          </span>
        </div>
      </div>
      <div className="mission-reward">
        {main && <CurrencyIcon kind={main.key} size={18} />}
        <b className="num">+{main ? compact(main.amount) : ''}</b>
      </div>
      {m.claimed ? (
        <span className="btn sm ghost mission-btn" aria-disabled>
          Получено
        </span>
      ) : m.claimable ? (
        <Btn size="sm" variant="gold" className="mission-btn" loading={busy} onClick={() => void claimMission(period, m.id)}>
          Забрать
        </Btn>
      ) : (
        <span className="btn sm mission-btn" aria-disabled>
          В процессе
        </span>
      )}
    </div>
  );
}

export function usePass() {
  const [pass, setPass] = useState<PassView | null>(null);
  const profile = useStore((s) => s.profile);
  const load = () =>
    fetchPass()
      .then((r) => {
        setPass(r.pass);
        setProfile(r.profile);
      })
      .catch(handleError);
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (pass) void fetchPass().then((r) => setPass(r.pass)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.pass.xp, profile?.pass.premium, profile?.pass.claimable, profile?.missions]);
  return { pass, setPass };
}

export function Pass() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const openModal = useStore((s) => s.openModal);
  const { pass, setPass } = usePass();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const now = useServerNow();
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => track('pass_view'), []);
  useEffect(() => {
    if (!pass || !trackRef.current) return;
    const el = trackRef.current.querySelector<HTMLElement>('.pass-col.current');
    if (el) trackRef.current.scrollLeft = el.offsetLeft - 90;
  }, [pass?.level]);

  const claim = async (level: number | 'all', t: 'free' | 'premium' | 'all') => {
    click();
    const r = await claimPass(level, t);
    if (r) setPass(r.pass);
  };
  const missions = tab === 'daily' ? p.missions.daily : p.missions.weekly;
  const resetAt = tab === 'daily' ? p.missions.dailyResetAt : p.missions.weeklyResetAt;
  const claimable = pass?.levels.some((l) => l.reached && (!l.claimedFree || (pass.premium && !l.claimedPremium)));

  return (
    <div className="screen pass">
      <TopBar />
      <section className="pass-hero art">
        <Img src="/art/season.webp" className="hero-img" style={{ objectPosition: '75% 30%' }} />
        <div className="hero-shade left" />
        <div className="pass-hero-text">
          <div className="kicker">Сезон {p.pass.number}</div>
          <h1 className="h-display" style={{ fontSize: 36 }}>
            {p.pass.name}
          </h1>
          <div className="caps sub" style={{ color: '#dfe8ff' }}>
            Отголоски остаются.
            <br />
            Беги дальше.
          </div>
          <div className="panel time-chip">
            <Clock size={14} /> Осталось <b>{duration(p.pass.endAt - now)}</b>
          </div>
        </div>
        <div className="side-note" style={{ position: 'absolute', right: 10, top: 20, textAlign: 'right' }}>
          Больше
          <br />
          забегов
          <br />
          <br />
          больше
          <br />
          наград
        </div>
      </section>

      <div className="panel pass-level">
        <div className="hex-level">
          <span>{pass?.level ?? p.pass.level}</span>
        </div>
        <div className="grow">
          <div className="tiny">Уровень сезона</div>
          <div className="row" style={{ gap: 8 }}>
            <div className="bar grow">
              <i style={{ width: `${pass ? (pass.xpIntoLevel / pass.xpPerLevel) * 100 : 0}%` }} />
            </div>
            <span className="sub num">
              {pass ? `${fmt(pass.xpIntoLevel)} / ${fmt(pass.xpPerLevel)} XP` : ''}
            </span>
          </div>
        </div>
        <Btn
          size="sm"
          onClick={() => {
            openModal({ type: 'passTrack' });
          }}
        >
          Все награды <ChevronRight size={14} />
        </Btn>
      </div>

      {!pass ? (
        <div className="skeleton mt" style={{ height: 220 }} />
      ) : (
        <div className="pass-track-wrap">
          <div className="pass-labels">
            <div className="pass-label free">
              <Gift size={22} />
              Бесплатно
            </div>
            <div className="pass-label premium">
              <Crown size={26} />
              Премиум
            </div>
          </div>
          <div className="pass-track" ref={trackRef}>
            {pass.levels.map((l) => (
              <div key={l.level} className={`pass-col ${l.level === pass.level ? 'current' : ''}`}>
                <div className={`lvl-badge ${l.level === pass.level ? 'on' : ''}`}>{l.level}</div>
                <RewardCell reward={l.free} state={l.claimedFree ? 'claimed' : l.reached ? 'claimable' : 'future'} onClaim={() => void claim(l.level, 'free')} />
                <RewardCell premium reward={l.premium} state={l.claimedPremium ? 'claimed' : !pass.premium ? 'locked' : l.reached ? 'claimable' : 'future'} onClaim={() => void claim(l.level, 'premium')} />
              </div>
            ))}
          </div>
        </div>
      )}
      {claimable && (
        <div className="row mt-s" style={{ justifyContent: 'center' }}>
          <Btn variant="gold" onClick={() => void claim('all', 'all')}>
            Забрать все награды
          </Btn>
        </div>
      )}

      <div className="row mt" style={{ gap: 8 }}>
        <div className="tabs grow" style={{ maxWidth: 300 }}>
          <button className={`tab ${tab === 'daily' ? 'on' : ''}`} onClick={() => setTab('daily')}>
            <Sun size={18} /> Дневные
            {p.missions.daily.some((m) => m.claimable) && <i className="badge-dot" />}
          </button>
          <button className={`tab ${tab === 'weekly' ? 'on' : ''}`} onClick={() => setTab('weekly')}>
            <CalendarDays size={18} /> Недельные
            {p.missions.weekly.some((m) => m.claimable) && <i className="badge-dot" />}
          </button>
        </div>
        <div className="sub row" style={{ gap: 4, fontSize: 11, marginLeft: 'auto' }}>
          <Clock size={12} /> Обновление через {duration(resetAt - now)}
        </div>
      </div>
      <div className="col mt-s">
        {missions.map((m) => (
          <MissionRow key={m.id} m={m} period={tab} />
        ))}
      </div>

      {pass && !pass.premium && (
        <div className="mt">
          <Cta onClick={() => openModal({ type: 'purchase', productId: cfg.season.premiumProductId })}>Купить пропуск</Cta>
          <div className="caption-line">больше наград. больше возможностей.</div>
        </div>
      )}
    </div>
  );
}
