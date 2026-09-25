import { Lock } from 'lucide-react';
import { isUnlocked, type RouteId } from '@void-rush/shared';
import { startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Cta, Img, Logo, TopBar, click } from '../ui/common';
import { Bolt, CurrencyIcon, Trophy } from '../ui/icons';
import { fmt } from '../ui/format';

export function RouteCard({ id, selected, onSelect }: { id: RouteId; selected: boolean; onSelect: () => void }) {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const r = cfg.routes[id];
  const unlocked = p.unlockedRoutes.includes(id);
  return (
    <button className={`route-card panel ${selected ? 'cyan selected' : ''} ${unlocked ? '' : 'locked'}`} onClick={onSelect}>
      <div className="route-art art">
        <Img src={`/art/route-${id}.webp`} className="fill" />
        <span className={`chip ${r.difficulty} route-chip`}>{r.difficultyLabel}</span>
        {!unlocked && (
          <div className="lock-overlay">
            <Lock size={30} />
          </div>
        )}
      </div>
      <div className="route-info">
        <b className="route-title">{r.name}</b>
        <span className="route-desc">{unlocked ? r.tagline : r.unlockText}</span>
        <div className="route-rewards">
          <span className="tiny">{unlocked ? 'Награды' : 'Возможные награды'}</span>
          <div className="row" style={{ gap: 5 }}>
            {r.rewardIcons.map((ic) => (
              <span key={ic} className="reward-ico">
                <CurrencyIcon kind={ic} size={18} />
              </span>
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
  const route = cfg.routes[selected];
  const unlocked = isUnlocked(route.unlockRule, { level: p.level, finishedRoutes: p.stats.finishedRoutes, passLevel: p.pass.level });
  const best = p.stats.routeBest[selected];

  return (
    <div className="screen routes">
      <TopBar />
      <header className="routes-head">
        <Logo size={40} />
        <h1 className="h-display" style={{ fontSize: 30, marginTop: 8 }}>
          Выбор забега
        </h1>
        <div className="sub">Каждый забег длится около 60 секунд.</div>
        <div className="side-note routes-note">
          Короткие
          <br />
          забеги
          <br />
          большие
          <br />
          награды
        </div>
      </header>

      <div className="hscroll route-list">
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

      <section className="panel route-detail">
        <div className="route-detail-art art">
          <Img src={`/art/route-${selected}.webp`} className="fill" />
        </div>
        <div className="route-detail-body">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <b className="route-detail-title">{route.name}</b>
            <span className={`chip ${route.difficulty}`}>{route.difficultyLabel}</span>
          </div>
          <div className="sub">{route.tagline}</div>
          <div className="detail-stats">
            <div>
              <div className="tiny row" style={{ gap: 4 }}>
                <Trophy size={14} /> Лучший результат
              </div>
              <b className="num">{best ? fmt(best.score) : '—'}</b>
            </div>
            <div>
              <div className="tiny">Дистанция</div>
              <b className="num">{best ? `${fmt(best.distance)} м` : '—'}</b>
            </div>
          </div>
          <div className="detail-bottom">
            <div>
              <div className="tiny">Ожидаемые награды</div>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                {route.rewardIcons.map((ic) => (
                  <span key={ic} className="reward-ico big">
                    <CurrencyIcon kind={ic} size={24} />
                  </span>
                ))}
              </div>
            </div>
            <div className="energy-cost">
              <div className="tiny">Энергия</div>
              <div className="row" style={{ gap: 4 }}>
                <Bolt size={26} />
                <b className="num" style={{ fontSize: 24 }}>
                  {route.energyCost}
                </b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt">
        {unlocked ? (
          <Cta loading={busy} onClick={() => void startRun(selected)}>
            Старт забега
          </Cta>
        ) : (
          <div className="panel locked-note">
            <Lock size={18} /> {route.unlockText}
          </div>
        )}
      </div>

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
          <span className="btn sm danger">В бой</span>
        </button>
      )}
    </div>
  );
}
