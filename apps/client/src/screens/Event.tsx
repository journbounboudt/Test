import { Clock, Skull, Swords, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EventView } from '../api/types';
import { track } from '../analytics';
import { claimEventMilestone, fetchEvent, handleError, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { BackBar, Btn, Cta, Img, RewardList, TopBar, useServerNow } from '../ui/common';
import { Bolt } from '../ui/icons';
import { compact, durationLong, fmt, plural } from '../ui/format';

export function EventLobby() {
  const p = useStore((s) => s.profile)!;
  const busy = useStore((s) => s.busy.startRun);
  const [ev, setEv] = useState<EventView | null>(null);
  const now = useServerNow();
  useEffect(() => {
    track('event_view');
    fetchEvent()
      .then((r) => setEv(r.event))
      .catch(handleError);
  }, [p.balances.stars]);

  if (!ev) {
    return (
      <div className="screen">
        <TopBar />
        <BackBar />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }
  const hpLeft = Math.max(0, ev.bossHp - ev.damage);
  const unlocked = p.unlockedRoutes.includes('event');
  return (
    <div className="screen event">
      <TopBar />
      <BackBar />
      <section className="event-hero art">
        <Img src="/art/event-boss.webp" className="hero-img" style={{ objectPosition: 'center 25%' }} />
        <div className="hero-shade" />
        <div className="event-hero-text">
          <div className="kicker" style={{ color: '#ff7a9a' }}>
            Глобальное событие
          </div>
          <h1 className="h-display" style={{ fontSize: 34 }}>
            {ev.title}
          </h1>
          <div className="row sub" style={{ gap: 6, justifyContent: 'center' }}>
            <Clock size={14} /> {ev.active ? `До конца ${durationLong(ev.endAt - now)}` : 'Событие завершено'}
          </div>
        </div>
        <div className="boss-panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b className="row" style={{ gap: 6 }}>
              <Skull size={18} color="#ff4d6d" /> {ev.bossName}
            </b>
            <span className="num sub">
              {compact(hpLeft)} / {compact(ev.bossHp)} HP
            </span>
          </div>
          <div className="boss-hp">
            <i style={{ width: `${(1 - ev.pct) * 100}%` }} />
            {ev.milestones.map((m) => (
              <span key={m.index} className="boss-mark" style={{ left: `${(1 - m.pct) * 100}%` }} />
            ))}
          </div>
          <div className="row sub" style={{ justifyContent: 'space-between', fontSize: 12 }}>
            <span className="row" style={{ gap: 4 }}>
              <Users size={13} /> {fmt(ev.participants)} {plural(ev.participants, ['бегун', 'бегуна', 'бегунов'])}
            </span>
          </div>
        </div>
      </section>

      <div className="event-me">
        <div className="panel">
          <span className="tiny">Твой вклад</span>
          <b className="num">{fmt(ev.me.damage)}</b>
        </div>
        <div className="panel">
          <span className="tiny">Лучший забег</span>
          <b className="num">{fmt(ev.me.best)}</b>
        </div>
      </div>

      <div className="section-head">
        <h2 className="h-section">Этапы сообщества</h2>
      </div>
      <div className="milestones">
        {ev.milestones.map((m) => (
          <div key={m.index} className={`panel milestone ${m.claimable ? 'gold' : m.claimed ? 'green' : ''}`}>
            <b>{m.label}</b>
            <RewardList bundle={m.reward} size={16} column />
            {m.claimed ? (
              <span className="sub green-text">Получено</span>
            ) : m.claimable ? (
              <Btn
                size="sm"
                variant="gold"
                onClick={async () => {
                  const r = await claimEventMilestone(m.index);
                  if (r) setEv(r.event);
                }}
              >
                Забрать
              </Btn>
            ) : (
              <span className="sub">{m.reached ? 'Сыграй забег' : 'Впереди'}</span>
            )}
          </div>
        ))}
      </div>

      <div className="event-lists">
        <div className="panel">
          <b className="caps tiny">Недавний урон</b>
          {ev.recent.length === 0 && <div className="sub mt-s">Пока тихо. Будь первым!</div>}
          {ev.recent.map((r, i) => (
            <div key={i} className="feed-row">
              <span>{r.name}</span>
              <b className="num red-text">−{compact(r.damage)}</b>
            </div>
          ))}
        </div>
        <div className="panel">
          <b className="caps tiny">Лучшие бойцы</b>
          {ev.top.map((r) => (
            <div key={r.rank} className={`feed-row ${r.me ? 'cyan-text' : ''}`}>
              <span>
                {r.rank}. {r.name}
              </span>
              <b className="num">{compact(r.damage)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="mt">
        {unlocked ? (
          <Cta variant="purple" icon={<Swords size={24} />} disabled={!ev.active} loading={busy} onClick={() => void startRun('event')}>
            В бой
          </Cta>
        ) : (
          <div className="locked-note">{p.level < 2 ? 'Событие откроется на уровне 2' : 'Событие пока недоступно'}</div>
        )}
        <div className="cta-note">
          {ev.me.freeAttemptsLeft > 0 ? (
            `${plural(ev.me.freeAttemptsLeft, ['Осталась', 'Осталось', 'Осталось'])} ${ev.me.freeAttemptsLeft} ${plural(ev.me.freeAttemptsLeft, ['бесплатная попытка', 'бесплатные попытки', 'бесплатных попыток'])}`
          ) : (
            <>
              <Bolt size={12} /> {ev.energyCost} энергии за попытку
            </>
          )}
        </div>
      </div>
    </div>
  );
}
