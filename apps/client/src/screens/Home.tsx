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
        <div className="side-note hero-note-r">
          Быстрее
          <br />
          дальше
          <br />
          больше
          <i className="note-rule" />
        </div>
        <div className="side-note hero-note-l">
          Короткие
          <br />
          забеги,
          <br />
          большие
          <br />
          истории
          <i className="note-rule" />
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
        {highlight && firstTime && <div className="coach">Начни с короткого обучающего забега</div>}
      </div>
      <div className="caption-line">
        <i />
        твои 60 секунд в космосе
        <i />
      </div>

      <div className="panel loop-strip">
        {[
          { icon: <Hourglass size={24} />, t: 'Забеги', s: '60 сек' },
          { icon: <Shard size={24} />, t: 'Собирай', s: 'осколки' },
          { icon: <Chip size={24} />, t: 'Усиливай', s: 'снаряжение' },
          { icon: <Trophy size={24} />, t: 'Бей', s: 'рекорды' },
        ].map((x, i) => (
          <div key={x.t} className="loop-step">
            <span className="loop-ico">{x.icon}</span>
            <span className="loop-txt">
              {x.t}
              <small>{x.s}</small>
            </span>
            {i < 3 && <ChevronRight size={14} className="loop-arrow" />}
          </div>
        ))}
      </div>

      <div className="promo-row">
        <button
          className="panel promo cyan"
          onClick={go(() => {
            useStore.setState({ shopTab: 'skins' });
            navigate('shop');
          })}
        >
          <span className="promo-art-wrap">
            <Img src="/art/skin-void_shadow.webp" className="promo-art" />
          </span>
          <span className="promo-text">
            <b>Скины</b>
            <span>Выделяйся в порталах</span>
          </span>
          <ChevronRight size={15} className="promo-chev" />
        </button>
        <button className="panel promo gold" onClick={go(() => navigate('pass'))}>
          <span className="promo-icon">
            <PassCard size={44} />
          </span>
          <span className="promo-text">
            <b>Пропуск</b>
            <span>Эксклюзивные награды</span>
          </span>
          <ChevronRight size={15} className="promo-chev" />
          {p.badges.pass && <i className="badge-dot" />}
        </button>
        <button className="panel promo cyan" onClick={go(() => openModal({ type: 'energy' }))}>
          <span className="promo-icon">
            <Battery size={44} />
          </span>
          <span className="promo-text">
            <b>Энергия</b>
            <span>Больше забегов и лута</span>
          </span>
          <ChevronRight size={15} className="promo-chev" />
        </button>
      </div>

      <button className="panel banner art" onClick={go(() => navigate('pass'))}>
        <Img src="/art/season.webp" className="banner-img" />
        <div className="banner-shade" />
        <div className="banner-body">
          <div className="kicker">Сезон {p.pass.number}</div>
          <div className="h-display banner-title">{p.pass.name}</div>
          <div className="sub">Особые награды. Ограниченное время.</div>
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
        <button className="panel banner art event" onClick={go(() => navigate('event'))}>
          <Img src="/art/event-boss.webp" className="banner-img" style={{ objectPosition: 'center 30%' }} />
          <div className="banner-shade red" />
          <div className="banner-body">
            <div className="kicker" style={{ color: '#ff7a9a' }}>
              Событие
            </div>
            <div className="h-display banner-title">{p.event.title}</div>
            <div className="sub">Весь мир бьёт одного Колосса</div>
          </div>
          <div className="banner-side">
            <div className="banner-timer red">
              <Stopwatch size={16} />
              <span>
                До конца
                <b className="num">{duration(p.event.endAt - now)}</b>
              </span>
            </div>
            <span className="btn sm danger banner-btn">
              В бой <ChevronRight size={14} />
            </span>
          </div>
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
