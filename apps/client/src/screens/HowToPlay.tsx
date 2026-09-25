import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { skipTutorial, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Cta, Img, Logo, TopBar, click } from '../ui/common';
import { Battery, BoostIcon, MagnetIcon, PassCard, ReviveIcon, ShieldIcon, Trophy } from '../ui/icons';
import { ShoppingCart } from 'lucide-react';

function Step({ n, title, art, children, extra }: { n: number; title: string; art?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className={`panel howto-card ${art ? 'has-art' : ''}`}>
      {art && <Img src={art} className="howto-bg" />}
      <div className="howto-title">
        <span className="step">{n}</span>
        <span>{title}</span>
      </div>
      {extra}
      <p>{children}</p>
    </div>
  );
}

export function HowToPlay() {
  const p = useStore((s) => s.profile)!;
  const cfg = useStore((s) => s.config)!;
  const busy = useStore((s) => s.busy.startRun);
  const navigate = useStore((s) => s.navigate);
  const back = useStore((s) => s.back);
  const b = cfg.boosts;
  const firstTime = !p.tutorialDone;
  return (
    <div className="screen howto">
      <TopBar />
      <header className="howto-head">
        <Logo size={46} />
        <h1 className="howto-h1">Как играть?</h1>
        <div className="tagline-rule">Просто. Быстро. Эпично.</div>
        <div className="side-note howto-note">
          Космос
          <br />
          ждёт
          <br />
          смелых
        </div>
      </header>
      <div className="howto-grid">
        <Step
          n={1}
          title="Свайпай влево и вправо"
          art="/art/howto-swipe.webp"
          extra={
            <div className="swipe-arrows" aria-hidden>
              <ChevronsLeft size={40} strokeWidth={2.6} className="l" />
              <ChevronsRight size={40} strokeWidth={2.6} className="r" />
            </div>
          }
        >
          Уклоняйся от препятствий, чтобы не потерять забег.
        </Step>
        <Step n={2} title="Собирай осколки" art="/art/howto-shards.webp">
          Осколки дают очки и ускоряют прокачку.
        </Step>
        <Step
          n={3}
          title="Выбирай буст"
          extra={
            <div className="boost-mini">
              <div className="bm gold">
                <BoostIcon size={28} />
                <b>{b.speed.name}</b>
                <span>+{Math.round(b.speed.value * 100)}%</span>
              </div>
              <div className="bm violet">
                <MagnetIcon size={28} />
                <b>{b.magnet.name}</b>
                <span>×{b.magnet.value}</span>
              </div>
              <div className="bm cyan">
                <ShieldIcon size={28} />
                <b>{b.shield.name}</b>
                <span>1 удар</span>
              </div>
            </div>
          }
        >
          На чекпоинтах выбирай один буст, чтобы усилить забег.
        </Step>
        <Step n={4} title="Добеги до финиша" art="/art/howto-finish.webp">
          Прорвись в финишный портал и открой сундук с наградами.
        </Step>
      </div>
      <div className="panel gold goal-banner">
        <span className="gb-ico">
          <Trophy size={36} />
        </span>
        <div>
          <b className="gold-text">Цель:</b> пройти как можно дальше за 60 секунд и набрать максимум очков.
        </div>
      </div>
      <div className="panel violet goal-banner">
        <span className="gb-ico">
          <ShoppingCart size={30} color="#c07bff" />
        </span>
        <div className="grow">
          <b className="violet-text">Донат ускоряет прогресс:</b>
          <div className="sub">скины, пропуск, энергия, возрождения.</div>
        </div>
        <div className="gb-icons">
          <PassCard size={28} />
          <Battery size={28} />
          <ReviveIcon size={28} />
        </div>
      </div>
      <div className="howto-cta">
        <div className="side-note">
          Быстрее
          <br />
          дальше
          <br />
          больше
        </div>
        <Cta variant="blue" small={!firstTime} loading={busy} onClick={() => void startRun('tutorial', { tutorial: true })}>
          {firstTime ? 'Начать' : 'Тренировка'}
        </Cta>
        <div className="side-note r">
          Один
          <br />
          забег.
          <br />
          Больше
          <br />
          лута.
        </div>
      </div>
      <button
        className="howto-link"
        onClick={() => {
          click();
          if (firstTime) {
            void skipTutorial();
            navigate('routes', { replace: true });
          } else back();
        }}
      >
        {firstTime ? 'Пропустить обучение' : 'Назад'}
      </button>
    </div>
  );
}
