import { Home as HomeIcon, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { doubleReward, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Btn, CountUp, Cta, Img, TopBar, click } from '../ui/common';
import { Coin, CurrencyIcon, Crown, Fragment, ReviveIcon, Road, Shard, Target, Trophy, Xp } from '../ui/icons';
import { fmt } from '../ui/format';
import { audio } from '../audio/audio';
import { tg } from '../platform/telegram';
import { track } from '../analytics';

const CARD_ICON = {
  credits: <Coin size={50} />,
  shards: <Shard size={50} />,
  passXp: <Crown size={50} />,
  fragment: <Fragment size={50} />,
  revive: <ReviveIcon size={50} />,
  xp: <Xp size={50} />,
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <div className={`grade grade-${grade.replace('+', 'p')}`}>
      <svg className="grade-frame" viewBox="0 0 240 120" aria-hidden>
        <defs>
          <linearGradient id="gf-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3c0" />
            <stop offset=".5" stopColor="var(--g1)" />
            <stop offset="1" stopColor="var(--g2)" />
          </linearGradient>
          <linearGradient id="gf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--g1)" stopOpacity=".32" />
            <stop offset="1" stopColor="var(--g1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M6 14h72l42 94 42-94h72l-14 12h-50l-50 88-50-88H20z" fill="url(#gf-fill)" stroke="url(#gf-stroke)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M34 26h36M170 26h36" stroke="url(#gf-stroke)" strokeWidth="1.2" opacity=".7" />
      </svg>
      <span className="grade-letter" data-g={grade}>
        {grade}
      </span>
    </div>
  );
}

export function Results() {
  const result = useStore((s) => s.lastResult);
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const navigate = useStore((s) => s.navigate);
  const busyRun = useStore((s) => s.busy.startRun);
  const busyDouble = useStore((s) => s.busy.double);
  const [revealed, setRevealed] = useState(0);
  const [doubled, setDoubled] = useState(false);

  const cards = result?.rewards?.cards ?? [];
  useEffect(() => {
    if (!result) return;
    track('result_view', { routeId: result.routeId, grade: result.summary.grade });
    if (result.summary.finished) audio.sfx('finish');
    if (result.newRecord) tg.haptic('success');
  }, [result]);
  useEffect(() => {
    if (revealed >= cards.length) return;
    const t = setTimeout(
      () => {
        setRevealed((r) => r + 1);
        audio.sfx('chest');
        tg.haptic('light');
      },
      revealed === 0 ? 900 : 360,
    );
    return () => clearTimeout(t);
  }, [revealed, cards.length]);

  useEffect(() => {
    if (result?.levelUps) useStore.getState().toast(`Новый уровень бегуна: ${p.level}!`, 'reward');
    if (result && result.passLevelAfter > result.passLevelBefore) useStore.getState().toast(`Уровень пропуска ${result.passLevelAfter}!`, 'reward');
    result?.missionsCompleted.forEach((m) => useStore.getState().toast(`Задание выполнено: ${m}`, 'reward'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.runId]);

  if (!result) {
    return (
      <div className="screen">
        <TopBar />
        <div className="empty panel mt">
          <Trophy size={40} />
          <b>Результатов пока нет</b>
          Сыграй забег, и здесь появятся твой ранг и награды.
          <div className="mt">
            <Btn variant="cyan" onClick={() => navigate('routes')}>
              К забегам
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  const s = result.summary;
  const route = cfg.routes[result.routeId];
  const tutorial = result.routeId === 'tutorial';
  const revealing = revealed < cards.length;
  const skipAll = () => setRevealed(cards.length);
  const canDouble = !tutorial && !result.rejected && result.doubleAvailable && !doubled;

  return (
    <div className="screen results" onClick={revealing ? skipAll : undefined}>
      <TopBar />
      <section className="results-hero art">
        <Img src="/art/results.webp" className="hero-img" />
        <div className="hero-shade" />
        <div className="results-head">
          <h1 className="h-display results-title">{s.finished ? 'Забег завершён' : 'Забег прерван'}</h1>
          <div className="results-sub">{s.finished ? 'Ты прорвался сквозь пустоту' : `${route.name} · ${fmt(s.distance)} м`}</div>
          <GradeBadge grade={s.grade} />
          <div className="grade-label">
            <i />
            ранг
            <i />
          </div>
        </div>
        <div className="side-note results-note-l">
          Больше
          <br />
          дальше
          <br />
          быстрее
          <br />
          ты
        </div>
        <div className="side-note results-note-r">
          Good
          <br />
          runs
          <br />
          better
          <br />
          you
        </div>
      </section>

      <div className={`panel cyan results-stats ${result.newRecord ? 'record-flash' : ''}`}>
        <div>
          <Trophy size={26} />
          <span className="tiny">Итоговый счёт</span>
          <CountUp value={s.score} ms={1300} className="rs-val" />
          {result.newRecord && <span className="record">▲ Новый рекорд!</span>}
        </div>
        <div>
          <Road size={26} />
          <span className="tiny">Дистанция</span>
          <span className="rs-val num">
            <CountUp value={s.distance} ms={1100} /> м
          </span>
        </div>
        <div>
          <Target size={26} />
          <span className="tiny">Макс. комбо</span>
          <span className="rs-val num">x{s.maxCombo}</span>
        </div>
        <div>
          <Shard size={26} />
          <span className="tiny">Осколки</span>
          <CountUp value={s.shards} ms={1100} className="rs-val" />
        </div>
      </div>

      {result.rejected ? (
        <div className="panel red mt center" style={{ padding: 14 }}>
          <b>Забег не засчитан</b>
          <div className="sub">Сервер не смог подтвердить результат. Счёт показан локально и не попадёт в рейтинг.</div>
        </div>
      ) : (
        <>
          <div className="rewards-title">
            <i />
            твои награды
            <i />
          </div>
          <div className={`chest-zone ${revealed > 0 ? 'open' : ''}`}>
            <div className="chest-rays" aria-hidden />
            <Img src="/art/chest.webp" className="chest-img" />
            <div className="reward-cards" data-n={cards.length}>
              {cards.map((c, i) => (
                <div key={i} className={`reward-card ${c.rarity} ${i < revealed ? 'shown' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                  <span className="rc-icon">{CARD_ICON[c.kind]}</span>
                  <span className="rc-label">{c.label}</span>
                  <b className="num rc-amt">
                    {c.kind === 'fragment' || c.kind === 'revive' ? `x${c.amount}` : `+${fmt(c.amount * (doubled && (c.kind === 'credits' || c.kind === 'shards') ? 2 : 1))}`}
                  </b>
                </div>
              ))}
            </div>
            {revealing && <div className="tap-hint">Нажми, чтобы открыть всё</div>}
          </div>
          <div className="result-meta">
            {result.ranked ? (
              <span>Засчитано в турнир недели{p.leaderboard.rank ? ` · место #${p.leaderboard.rank}` : ''}</span>
            ) : route.competitive ? (
              <span>Не засчитано в рейтинг</span>
            ) : null}
            {result.contribution > 0 && <span className="red-text">Урон Колоссу: {fmt(result.contribution)}</span>}
          </div>
        </>
      )}

      <div className={`results-actions ${canDouble ? 'two' : ''}`} onClick={(e) => e.stopPropagation()}>
        {tutorial ? (
          <Cta
            onClick={() => {
              useStore.setState({ gearHighlight: true });
              navigate('gear');
            }}
          >
            Улучшить снаряжение
          </Cta>
        ) : (
          <Cta small={canDouble} loading={busyRun} onClick={() => void startRun(result.routeId)}>
            Ещё раз
          </Cta>
        )}
        {canDouble && (
          <button
            className="double-btn"
            disabled={busyDouble}
            onClick={async () => {
              click();
              if (await doubleReward(result.runId)) setDoubled(true);
            }}
          >
            <span className="x2">
              <b>x2</b>
            </span>
            <span className="double-txt">
              <b>Удвоить награду</b>
              <span className="row" style={{ gap: 4 }}>
                <CurrencyIcon kind={cfg.doubleReward.currency} size={16} /> <span className="num">{cfg.doubleReward.amount}</span>
              </span>
            </span>
            {busyDouble && <span className="spinner" />}
          </button>
        )}
      </div>
      {canDouble && (
        <div className="double-note">
          <Info size={14} /> Удваивает кредиты и осколки этого забега
        </div>
      )}
      {doubled && <div className="double-note done">Награды удвоены!</div>}
      <div className="row mt" style={{ justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <Btn variant="ghost" size="sm" onClick={() => navigate(tutorial ? 'routes' : 'home')}>
          {tutorial ? (
            'К выбору забега'
          ) : (
            <>
              <HomeIcon size={14} /> На главную
            </>
          )}
        </Btn>
      </div>
    </div>
  );
}
