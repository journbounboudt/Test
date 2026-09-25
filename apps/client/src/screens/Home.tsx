import { ChevronRight } from 'lucide-react';
import { useStore } from '../state/store';
import { Cta, Img, Logo, TopBar, click, useServerNow } from '../ui/common';
import { Bolt, Chip, Crown, Flame, Gift, Hourglass, Shard, Trophy } from '../ui/icons';
import { duration, fmt } from '../ui/format';

export function Home() {
  const p = useStore((s) => s.profile)!;
  const navigate = useStore((s) => s.navigate);
  const openModal = useStore((s) => s.openModal);
  const highlight = useStore((s) => s.homeHighlight);
  const now = useServerNow();
  const go = (fn: () => void) => () => {
    click();
    fn();
  };

  return (
    <div className="screen home">
      <TopBar />
      <section className="home-hero art">
        <Img src="/art/hero-home.webp" className="hero-img" />
        <div className="hero-shade" />
        <div className="hero-top">
          <Logo size={50} />
          <div className="hero-tagline">60 секунд. Один забег. Большой лут.</div>
        </div>
        <div className="side-note hero-note-r">
          Быстрее
          <br />
          дальше
          <br />
          больше
        </div>
        <div className="side-note hero-note-l">
          Маленькие
          <br />
          забеги
          <br />
          большие
          <br />
          истории
        </div>
        <div className="home-cards">
          <button className="panel home-card" onClick={go(() => navigate('leaderboard'))}>
            <div className="row sub" style={{ gap: 6 }}>
              <Trophy size={16} /> ЛУЧШИЙ РЕЗУЛЬТАТ
            </div>
            <div className="home-card-value num">{fmt(p.stats.bestScore)}</div>
            <div className="row sub" style={{ justifyContent: 'space-between' }}>
              <span>{p.leaderboard.rank ? `Место #${p.leaderboard.rank}` : 'Турнир недели'}</span>
              <ChevronRight size={16} />
            </div>
            {p.badges.leaderboard && <i className="badge-dot" />}
          </button>
          <button className="panel home-card" onClick={go(() => openModal({ type: 'streak' }))}>
            <div className="row sub" style={{ gap: 6 }}>
              <Flame size={16} /> СЕРИЯ ДНЕЙ
            </div>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <span className="home-card-value num">{p.streak.count}</span>
              <span className="sub">{p.streak.count === 1 ? 'день' : 'дней подряд'}</span>
            </div>
            <div className="streak-dots">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className={i < Math.min(5, p.streak.count - (p.streak.claimable ? 1 : 0)) ? 'on' : ''} />
              ))}
              <Gift size={18} />
            </div>
            {p.streak.claimable && <i className="badge-dot" />}
          </button>
        </div>
      </section>

      <div className={`home-cta ${highlight ? 'pulse' : ''}`}>
        <Cta onClick={() => navigate(p.tutorialDone ? 'routes' : 'howto')}>В забег</Cta>
        {highlight && <div className="coach">Начни с короткого обучающего забега</div>}
      </div>
      <div className="caption-line">— твои 60 секунд в космосе —</div>

      <div className="panel loop-strip">
        {[
          { icon: <Hourglass size={24} />, t: 'Забеги', s: '60 сек' },
          { icon: <Shard size={24} />, t: 'Собирай', s: 'осколки' },
          { icon: <Chip size={24} />, t: 'Усиливай', s: 'снаряжение' },
          { icon: <Trophy size={24} />, t: 'Бей', s: 'рекорды' },
        ].map((x, i) => (
          <div key={x.t} className="loop-step">
            {x.icon}
            <div>
              <div>{x.t}</div>
              <div className="muted">{x.s}</div>
            </div>
            {i < 3 && <span className="loop-arrow">→</span>}
          </div>
        ))}
      </div>

      <div className="promo-row">
        <button
          className="panel promo cyan-edge"
          onClick={go(() => {
            useStore.setState({ shopTab: 'skins' });
            navigate('shop');
          })}
        >
          <Img src="/art/skin-void_shadow.webp" className="promo-art" />
          <div className="promo-text">
            <b className="cyan-text">Скины</b>
            <span>Выделяйся в порталах</span>
          </div>
          <ChevronRight size={16} className="promo-chev" />
        </button>
        <button className="panel promo gold" onClick={go(() => navigate('pass'))}>
          <div className="promo-icon">
            <Crown size={40} />
          </div>
          <div className="promo-text">
            <b>Пропуск</b>
            <span>Эксклюзивные награды</span>
          </div>
          <ChevronRight size={16} className="promo-chev" />
          {p.badges.pass && <i className="badge-dot" />}
        </button>
        <button className="panel promo cyan-edge" onClick={go(() => openModal({ type: 'energy' }))}>
          <div className="promo-icon">
            <Bolt size={40} />
          </div>
          <div className="promo-text">
            <b className="cyan-text">Энергия</b>
            <span>Больше забегов — больше лута</span>
          </div>
          <ChevronRight size={16} className="promo-chev" />
        </button>
      </div>

      <button className="panel banner art" onClick={go(() => navigate('pass'))}>
        <Img src="/art/season.webp" className="banner-img" />
        <div className="banner-shade" />
        <div className="banner-body">
          <div className="kicker">Сезон {p.pass.number}</div>
          <div className="h-display" style={{ fontSize: 26 }}>
            {p.pass.name}
          </div>
          <div className="sub">Особые награды. Ограниченное время.</div>
        </div>
        <div className="banner-side">
          <div className="sub">Осталось</div>
          <b>{duration(p.pass.endAt - now)}</b>
          <span className="btn sm">Смотреть</span>
        </div>
      </button>

      {p.event.active && (
        <button className="panel banner art event" onClick={go(() => navigate('event'))}>
          <Img src="/art/event-boss.webp" className="banner-img" style={{ objectPosition: 'center 30%' }} />
          <div className="banner-shade red" />
          <div className="banner-body">
            <div className="kicker" style={{ color: '#ff7a9a' }}>
              Событие
            </div>
            <div className="h-display" style={{ fontSize: 22 }}>
              {p.event.title}
            </div>
            <div className="sub">Весь мир бьёт одного Колосса</div>
          </div>
          <div className="banner-side">
            <div className="sub">До конца</div>
            <b>{duration(p.event.endAt - now)}</b>
            <span className="btn sm danger">В бой</span>
          </div>
        </button>
      )}

      {p.tutorialDone && (
        <button className="howto-link" onClick={go(() => navigate('howto'))}>
          Как играть?
        </button>
      )}
    </div>
  );
}
