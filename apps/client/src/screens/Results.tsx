import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { doubleReward, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Btn, Cta, Img, TopBar, click } from '../ui/common';
import { Coin, CurrencyIcon, Crown, Fragment, ReviveIcon, Shard, Target, Trophy, Xp } from '../ui/icons';
import { fmt } from '../ui/format';
import { audio } from '../audio/audio';
import { track } from '../analytics';

const CARD_ICON = {
  credits: <Coin size={54} />,
  shards: <Shard size={54} />,
  passXp: <Crown size={54} />,
  fragment: <Fragment size={54} />,
  revive: <ReviveIcon size={54} />,
  xp: <Xp size={54} />,
};

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
  }, [result]);
  useEffect(() => {
    if (revealed >= cards.length) return;
    const t = setTimeout(() => {
      setRevealed((r) => r + 1);
      audio.sfx('chest');
    }, revealed === 0 ? 700 : 320);
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
          <b>Нет результатов</b>
          Сыграй забег, чтобы увидеть награды.
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
  const skipAll = () => setRevealed(cards.length);

  return (
    <div className="screen results" onClick={skipAll}>
      <TopBar />
      <section className="results-hero art">
        <Img src="/art/results.webp" className="hero-img" />
        <div className="hero-shade" />
        <div className="results-head">
          <h1 className="h-display results-title">{s.finished ? 'Забег завершён' : 'Забег прерван'}</h1>
          <div className="results-sub">{s.finished ? 'Ты прорвался сквозь пустоту' : `${route.name} · ${fmt(s.distance)} м`}</div>
          <div className={`grade grade-${s.grade.replace('+', 'p')}`}>
            <span>{s.grade}</span>
          </div>
          <div className="grade-label">— ранг —</div>
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
      </section>

      <div className="panel cyan results-stats">
        <div>
          <Trophy size={24} />
          <span className="tiny">Итоговый счёт</span>
          <b className="num">{fmt(s.score)}</b>
          {result.newRecord && <span className="record">▲ Новый рекорд!</span>}
        </div>
        <div>
          <CurrencyIcon kind="module" size={24} />
          <span className="tiny">Пройденная дистанция</span>
          <b className="num">{fmt(s.distance)} м</b>
        </div>
        <div>
          <Target size={24} />
          <span className="tiny">Макс. комбо</span>
          <b className="num">x{s.maxCombo}</b>
        </div>
        <div>
          <Shard size={24} />
          <span className="tiny">Собрано осколков</span>
          <b className="num">{fmt(s.shards)}</b>
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
            <span>— твои награды —</span>
          </div>
          <div className="chest-zone">
            <Img src="/art/chest.webp" className="chest-img" />
            <div className="reward-cards">
              {cards.map((c, i) => (
                <div key={i} className={`reward-card ${c.rarity} ${i < revealed ? 'shown' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
                  {CARD_ICON[c.kind]}
                  <span className="rc-label">{c.label}</span>
                  <b className="num">{c.kind === 'fragment' || c.kind === 'revive' ? `x${c.amount}` : `+${fmt(c.amount * (doubled && (c.kind === 'credits' || c.kind === 'shards') ? 2 : 1))}`}</b>
                </div>
              ))}
            </div>
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

      <div className="results-actions" onClick={(e) => e.stopPropagation()}>
        {tutorial ? (
          <Cta
            onClick={() => {
              useStore.setState({ gearHighlight: true });
              navigate('gear');
            }}
          >
            Улучшить
          </Cta>
        ) : (
          <Cta small loading={busyRun} onClick={() => void startRun(result.routeId)}>
            Ещё раз
          </Cta>
        )}
        {!tutorial && !result.rejected && result.doubleAvailable && !doubled && (
          <button
            className="double-btn"
            disabled={busyDouble}
            onClick={async () => {
              click();
              if (await doubleReward(result.runId)) setDoubled(true);
            }}
          >
            <span className="x2">x2</span>
            <span>
              <b>Удвоить награду</b>
              <span className="row" style={{ gap: 4, justifyContent: 'center' }}>
                <CurrencyIcon kind={cfg.doubleReward.currency} size={16} /> {cfg.doubleReward.amount}
              </span>
            </span>
          </button>
        )}
      </div>
      {!tutorial && !result.rejected && result.doubleAvailable && !doubled && (
        <div className="sub row" style={{ justifyContent: 'center', gap: 6, marginTop: 6 }}>
          <Info size={14} /> Удвой кредиты и осколки этого забега
        </div>
      )}
      <div className="row mt" style={{ justifyContent: 'center' }}>
        <Btn variant="ghost" onClick={() => navigate('home')}>
          На главную
        </Btn>
      </div>
    </div>
  );
}
