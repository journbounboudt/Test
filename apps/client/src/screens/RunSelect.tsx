import { ChevronRight, Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isUnlocked, type RouteId } from '@void-rush/shared';
import { startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Cta, Img, Logo, TopBar, click } from '../ui/common';
import { Bolt, CurrencyIcon, Road, Trophy } from '../ui/icons';
import { fmt } from '../ui/format';

const REWARD_TONE: Record<string, string> = { credits: 'gold', pass: 'gold', shards: 'violet', module: 'violet', fragment: 'violet', xp: 'cyan', mystery: 'grey' };

function RewardTile({ kind, size = 18, big }: { kind: string; size?: number; big?: boolean }) {
  return (
    <span className={`reward-ico ${REWARD_TONE[kind] ?? ''} ${big ? 'big' : ''}`}>
      <CurrencyIcon kind={kind} size={size} />
    </span>
  );
}

export function RouteCard({ id, selected, onSelect }: { id: RouteId; selected: boolean; onSelect: () => void }) {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const r = cfg.routes[id];
  const unlocked = isUnlocked(r.unlockRule, { level: p.level, finishedRoutes: p.stats.finishedRoutes, passLevel: p.pass.level });
  const best = p.stats.routeBest[id];
  return (
    <button className={`route-card panel ${r.difficulty} ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} onClick={onSelect} aria-pressed={selected}>
      <div className="route-art art">
        <Img src={`/art/route-${id}.webp`} className="fill" />
        <span className={`chip ${r.difficulty} route-chip`}>{r.difficultyLabel}</span>
        {!unlocked && (
          <div className="lock-overlay">
            <span className="lock-badge">
              <Lock size={22} strokeWidth={2.4} />
            </span>
          </div>
        )}
        {unlocked && best?.finished && <span className="route-done" title="Маршрут пройден">✓</span>}
      </div>
      <div className="route-info">
        <b className="route-title">{r.name}</b>
        <span className="route-desc">{unlocked ? r.tagline : r.unlockText}</span>
        <div className="route-rewards">
          <span className="tiny">{unlocked ? 'Награды' : 'Возможные награды'}</span>
          <div className="route-reward-row">
            {r.rewardIcons.map((ic) => (
              <RewardTile key={ic} kind={ic} />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export function RunSelect() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const selected = useStore((s) => s.selectedRoute);
  const busy = useStore((s) => s.busy.startRun);
  const navigate = useStore((s) => s.navigate);
  const listRef = useRef<HTMLDivElement>(null);
  const route = cfg.routes[selected];
  const unlocked = isUnlocked(route.unlockRule, { level: p.level, finishedRoutes: p.stats.finishedRoutes, passLevel: p.pass.level });
  const best = p.stats.routeBest[selected];
  const energyShort = p.energy.value < route.energyCost;

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('.route-card.selected');
    if (list && el && el.offsetLeft + el.offsetWidth > list.clientWidth) list.scrollLeft = el.offsetLeft - 12;
  }, []);

  return (
    <div className="screen routes">
      <TopBar />
      <header className="routes-head">
        <Logo size={44} />
        <h1 className="h-display routes-title">Выбор забега</h1>
        <div className="routes-sub">Каждый забег длится около 60 секунд.</div>
        <div className="side-note routes-note">
          Короткие
          <br />
          забеги,
          <br />
          большие
          <br />
          награды
        </div>
      </header>

      <div className="hscroll route-list" ref={listRef}>
        {cfg.routeOrder.map((id) => (
          <RouteCard
            key={id}
            id={id}
            selected={id === selected}
            onSelect={() => {
              click();
              useStore.setState({ selectedRoute: id });
            }}
          />
        ))}
      </div>

      <section key={selected} className={`panel route-detail ${unlocked ? '' : 'locked'}`}>
        <div className="route-detail-art art">
          <Img src={`/art/route-${selected}.webp`} className="fill" />
        </div>
        <div className="route-detail-body">
          <div className="rd-head">
            <b className="route-detail-title">{route.name}</b>
            <span className={`chip ${route.difficulty}`}>{route.difficultyLabel}</span>
          </div>
          <div className="sub">{route.tagline}</div>
          <div className="detail-stats">
            <div className="ds-cell">
              <Trophy size={26} />
              <span>
                <span className="tiny">Лучший результат</span>
                <b className="num">{best ? fmt(best.score) : '—'}</b>
              </span>
            </div>
            <div className="ds-cell">
              <Road size={22} />
              <span>
                <span className="tiny">Дистанция</span>
                <b className="num">{best ? `${fmt(best.distance)} м` : '—'}</b>
              </span>
            </div>
          </div>
          <div className="detail-bottom">
            <div className="grow">
              <div className="tiny">Ожидаемые награды</div>
              <div className="route-reward-row" style={{ marginTop: 5 }}>
                {route.rewardIcons.map((ic) => (
                  <RewardTile key={ic} kind={ic} size={24} big />
                ))}
              </div>
            </div>
            <div className={`energy-cost ${energyShort ? 'short' : ''}`}>
              <div className="tiny">Энергия</div>
              <div className="ec-val">
                <Bolt size={26} />
                <b className="num">{route.energyCost}</b>
              </div>
            </div>
          </div>
        </div>
        <div className="rd-cta">
          {unlocked ? (
            <Cta loading={busy} onClick={() => void startRun(selected)}>
              Старт забега
            </Cta>
          ) : (
            <div className="locked-note">
              <Lock size={16} /> {route.unlockText}
            </div>
          )}
        </div>
      </section>

      {p.event.active && (
        <button
          className="panel event-strip mt"
          onClick={() => {
            click();
            navigate('event');
          }}
        >
          <span className="chip event">Событие</span>
          <b className="grow">{cfg.event.title}</b>
          <span className="btn sm danger">
            В бой <ChevronRight size={14} />
          </span>
        </button>
      )}
    </div>
  );
}
