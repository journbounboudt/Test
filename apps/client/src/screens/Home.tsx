import { Check, ChevronRight, HelpCircle } from 'lucide-react';
import { useStore } from '../state/store';
import { CountUp, Cta, Img, Logo, TopBar, click, useParallax, useServerNow } from '../ui/common';
import { Battery, Chip, Flame, Gift, Hourglass, PassCard, Shard, Stopwatch, Trophy } from '../ui/icons';
import { duration, plural } from '../ui/format';

export function Home() {
  const p = useStore((s) => s.profile)!;
  const navigate = useStore((s) => s.navigate);
  const openModal = useStore((s) => s.openModal);
  const highlight = useStore((s) => s.homeHighlight);
  const now = useServerNow();
  const heroRef = useParallax<HTMLImageElement>(0.22);
  const go = (fn: () => void) => () => {
    click();
    fn();
  };
  const firstTime = !p.tutorialDone;
  const streakDone = Math.min(5, p.streak.count - (p.streak.claimable ? 1 : 0));

  return (
    <div className="screen home">
      <TopBar />
      <section className="home-hero art">
        <div className="hero-parallax">
          <img ref={heroRef} src="/art/hero-home.webp" className="hero-img" alt="" decoding="async" />
        </div>
        <div className="hero-portal-glow" aria-hidden />
        <div className="hero-shade" />
        <div className="hero-top">
          <Logo size={52} />
          <div className="hero-tagline">60 секунд. Один забег. Большой лут.</div>
        </div>
        <div className="home-cards">
          <button className="panel home-card" onClick={go(() => navigate('leaderboard'))}>
            <div className="hc-head">
              <Trophy size={17} /> Лучший результат
            </div>
            <div className="home-card-value">{p.stats.bestScore > 0 ? <CountUp value={p.stats.bestScore} ms={900} /> : '—'}</div>
            <div className="hc-foot">
              <span>{p.leaderboard.rank ? `Место #${p.leaderboard.rank}` : p.stats.bestScore > 0 ? 'Турнир недели' : 'Сыграй первый забег'}</span>
              <ChevronRight size={16} />
            </div>
            {p.badges.leaderboard && <i className="badge-dot" />}
          </button>
          <button className={`panel home-card streak ${p.streak.claimable ? 'claimable' : ''}`} onClick={go(() => openModal({ type: 'streak' }))}>
            <div className="hc-head">
              <Flame size={17} /> Серия дней
              <ChevronRight size={16} className="hc-chev" />
            </div>
            <div className="hc-streak">
              <span className="home-card-value num">{p.streak.count}</span>
              <span className="hc-unit">{plural(p.streak.count, ['день подряд', 'дня подряд', 'дней подряд'])}</span>
            </div>
            <div className="streak-dots">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className={i < streakDone ? 'on' : ''}>
                  {i < streakDone && <Check size={10} strokeWidth={4} />}
                </i>
              ))}
              <span className={`streak-gift ${p.streak.claimable ? 'ready' : ''}`}>
                <Gift size={20} />
              </span>
            </div>
            {p.streak.claimable && <i className="badge-dot" />}
          </button>
        </div>
      </section>

      <div className={`home-cta ${highlight ? 'pulse' : ''}`}>
        <Cta onClick={() => navigate(firstTime ? 'howto' : 'routes')}>В забег</Cta>
        {firstTime && <div className="coach">Начни с обучения — 60 секунд</div>}
      </div>

      {p.stats.runs < 3 && (
        <div className="panel loop-strip">
          {[
            { icon: <Hourglass size={22} />, t: 'Беги' },
            { icon: <Shard size={22} />, t: 'Собирай' },
            { icon: <Chip size={22} />, t: 'Усиливай' },
            { icon: <Trophy size={22} />, t: 'Бей рекорды' },
          ].map((x, i) => (
            <div key={x.t} className="loop-step">
              <span className="loop-ico">{x.icon}</span>
              <span className="loop-txt">{x.t}</span>
              {i < 3 && <ChevronRight size={14} className="loop-arrow" />}
            </div>
          ))}
        </div>
      )}

      <div className="promo-row">
        <button
          className="panel promo cyan"
          onClick={go(() => {
            useStore.setState({ shopTab: 'skins' });
            navigate('shop');
          })}
        >
          <span className="promo-icon art">
            <Img src="/art/skin-void_shadow.webp" className="promo-art" />
          </span>
          <b>Скины</b>
          <span className="promo-sub">Твой стиль</span>
        </button>
        <button className="panel promo gold" onClick={go(() => navigate('pass'))}>
          <span className="promo-icon">
            <PassCard size={36} />
          </span>
          <b>Пропуск</b>
          <span className="promo-sub">Награды сезона</span>
          {p.badges.pass && <i className="badge-dot" />}
        </button>
        <button className="panel promo cyan" onClick={go(() => openModal({ type: 'energy' }))}>
          <span className="promo-icon">
            <Battery size={36} />
          </span>
          <b>Энергия</b>
          <span className="promo-sub">Больше забегов</span>
        </button>
      </div>

      <button className="panel banner art" onClick={go(() => navigate('pass'))}>
        <Img src="/art/season.webp" className="banner-img" />
        <div className="banner-shade" />
        <div className="banner-body">
          <div className="kicker">Сезон {p.pass.number}</div>
          <div className="h-display banner-title">{p.pass.name}</div>
        </div>
        <div className="banner-side">
          <div className="banner-timer">
            <Stopwatch size={16} />
            <span>
              Осталось
              <b className="num">{duration(p.pass.endAt - now)}</b>
            </span>
          </div>
          <span className="btn sm banner-btn">
            Смотреть <ChevronRight size={14} />
          </span>
        </div>
      </button>

      {p.event.active && (
        <button className="panel event-strip home-event" onClick={go(() => navigate('event'))}>
          <Img src="/art/event-boss.webp" className="es-thumb" />
          <span className="es-body">
            <span className="es-top">
              <span className="chip event">Событие</span>
              <span className="es-timer num">
                <Stopwatch size={14} /> {duration(p.event.endAt - now)}
              </span>
            </span>
            <b>{p.event.title}</b>
          </span>
          <ChevronRight size={18} className="es-chev" />
        </button>
      )}

      {!firstTime && (
        <button className="howto-link" onClick={go(() => navigate('howto'))}>
          <HelpCircle size={14} /> Как играть
        </button>
      )}
    </div>
  );
}
