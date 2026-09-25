import { skipTutorial, startRun } from '../state/actions';
import { useStore } from '../state/store';
import { Cta, Img, Logo, TopBar, click } from '../ui/common';
import { BoostIcon, Crown, MagnetIcon, ReviveIcon, ShieldIcon, Trophy, Bolt } from '../ui/icons';
import { ShoppingCart } from 'lucide-react';

export function HowToPlay() {
  const p = useStore((s) => s.profile)!;
  const busy = useStore((s) => s.busy.startRun);
  const navigate = useStore((s) => s.navigate);
  return (
    <div className="screen howto">
      <TopBar />
      <header className="howto-head">
        <Logo size={46} />
        <h1 className="h-display" style={{ fontSize: 32, marginTop: 6 }}>
          Как играть?
        </h1>
        <div className="tagline-rule">Просто. Быстро. Эпично.</div>
      </header>
      <div className="howto-grid">
        <div className="panel howto-card">
          <div className="howto-title">
            <span className="step">1</span>Свайпай влево и вправо
          </div>
          <div className="howto-art art">
            <Img src="/art/howto-swipe.webp" className="fill" />
            <span className="swipe-arrows l">«</span>
            <span className="swipe-arrows r">»</span>
          </div>
          <p>Уклоняйся от препятствий, чтобы не потерять забег.</p>
        </div>
        <div className="panel howto-card">
          <div className="howto-title">
            <span className="step">2</span>Собирай осколки
          </div>
          <div className="howto-art art">
            <Img src="/art/howto-shards.webp" className="fill" />
          </div>
          <p>Собирай осколки, чтобы набирать очки и быстрее развиваться.</p>
        </div>
        <div className="panel howto-card">
          <div className="howto-title">
            <span className="step">3</span>Выбирай буст
          </div>
          <div className="boost-mini">
            <div className="bm gold">
              <BoostIcon size={26} />
              <b>Скорость</b>
              <span>+12%</span>
            </div>
            <div className="bm violet">
              <MagnetIcon size={26} />
              <b>Магнит</b>
              <span>×1.8</span>
            </div>
            <div className="bm cyan">
              <ShieldIcon size={26} />
              <b>Щит</b>
              <span>1 удар</span>
            </div>
          </div>
          <p>После чекпоинтов выбирай один из бустов, чтобы усилить свой забег.</p>
        </div>
        <div className="panel howto-card">
          <div className="howto-title">
            <span className="step">4</span>Добеги до финиша
          </div>
          <div className="howto-art art">
            <Img src="/art/howto-finish.webp" className="fill" />
          </div>
          <p>Добеги до финишного портала, чтобы открыть сундук с наградами.</p>
        </div>
      </div>
      <div className="panel gold goal-banner">
        <Trophy size={34} />
        <div>
          <b className="gold-text">Цель:</b> пройти как можно дальше за 60 секунд и набрать максимум очков.
        </div>
      </div>
      <div className="panel violet goal-banner">
        <ShoppingCart size={30} color="#c07bff" />
        <div className="grow">
          <b className="violet-text">Донат ускоряет прогресс:</b>
          <div className="sub">скины, пропуск, энергия, возрождения.</div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Crown size={24} />
          <Bolt size={24} />
          <ReviveIcon size={24} />
        </div>
      </div>
      <div className="mt">
        <Cta variant="blue" loading={busy} onClick={() => void startRun('tutorial', { tutorial: true })}>
          {p.tutorialDone ? 'Тренировка' : 'Начать'}
        </Cta>
      </div>
      <button
        className="howto-link"
        onClick={() => {
          click();
          if (!p.tutorialDone) void skipTutorial();
          navigate('home');
        }}
      >
        {p.tutorialDone ? 'Назад' : 'Пропустить обучение'}
      </button>
    </div>
  );
}
