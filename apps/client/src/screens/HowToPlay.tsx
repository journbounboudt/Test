import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { skipTutorial, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Cta, Img, TopBar, click } from '../ui/common';
import { BoostIcon, MagnetIcon, ShieldIcon } from '../ui/icons';

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
        <h1 className="howto-h1">Как играть</h1>
        <div className="howto-sub">Пройди как можно дальше за 60 секунд</div>
      </header>
      <div className="howto-grid">
        <Step
          n={1}
          title="Свайпай"
          art="/art/howto-swipe.webp"
          extra={
            <div className="swipe-arrows" aria-hidden>
              <ChevronsLeft size={40} strokeWidth={2.6} className="l" />
              <ChevronsRight size={40} strokeWidth={2.6} className="r" />
            </div>
          }
        >
          Уклоняйся от препятствий
        </Step>
        <Step n={2} title="Собирай осколки" art="/art/howto-shards.webp">
          Очки и прокачка
        </Step>
        <Step
          n={3}
          title="Выбирай буст"
          extra={
            <div className="boost-mini">
              <div className="bm gold" title={b.speed.name}>
                <BoostIcon size={28} />
                <span>+{Math.round(b.speed.value * 100)}%</span>
              </div>
              <div className="bm violet" title={b.magnet.name}>
                <MagnetIcon size={28} />
                <span>×{b.magnet.value}</span>
              </div>
              <div className="bm cyan" title={b.shield.name}>
                <ShieldIcon size={28} />
                <span>1 удар</span>
              </div>
            </div>
          }
        >
          На каждом чекпоинте
        </Step>
        <Step n={4} title="Добеги до финиша" art="/art/howto-finish.webp">
          Открой сундук с наградами
        </Step>
      </div>
      <div className="howto-cta">
        <Cta variant="blue" small={!firstTime} loading={busy} onClick={() => void startRun('tutorial', { tutorial: true })}>
          {firstTime ? 'Начать' : 'Тренировка'}
        </Cta>
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
