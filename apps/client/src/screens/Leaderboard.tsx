import { Gift, Share2, Trophy as TrophyL, Users } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type { LeaderboardView } from '../api/types';
import { track } from '../analytics';
import { tg } from '../platform/telegram';
import { claimWeekly, fetchLeaderboard, handleError } from '../state/actions';
import { useStore } from '../state/store';
import { Avatar, BackBar, Btn, Cta, Img, RewardList, TopBar, click, useServerNow } from '../ui/common';
import { Crown, CurrencyIcon, Shard, StarIcon, Stopwatch } from '../ui/icons';
import { durationLong, fmt } from '../ui/format';

type Tab = 'top' | 'friends' | 'rewards';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={28} />;
  if (rank <= 3) return <span className={`rank-medal r${rank}`}>{rank}</span>;
  return <span className="rank-num">{rank}</span>;
}

export function Leaderboard() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const meta = useStore((s) => s.meta);
  const navigate = useStore((s) => s.navigate);
  const [tab, setTab] = useState<Tab>('top');
  const [data, setData] = useState<LeaderboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const now = useServerNow();

  useEffect(() => {
    if (tab === 'rewards') return;
    setLoading(true);
    fetchLeaderboard(tab)
      .then((r) => setData(r.leaderboard))
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(() => track('leaderboard_view'), []);

  const invite = () => {
    click();
    const link = meta?.share ? `https://t.me/${meta.share.bot}/${meta.share.app}?startapp=ref_${p.playerId.replace(/^p_/, '')}` : `${location.origin}/?startapp=ref_${p.playerId.replace(/^p_/, '')}`;
    tg.share(link, 'Беги со мной в VOID RUSH — 60 секунд, чтобы уйти дальше всех!');
  };
  const meInList = data?.rows.some((r) => r.me);
  const rows = data ? (expanded ? data.rows : data.rows.filter((r, i) => i < 10 || r.me)) : [];
  const hidden = data ? data.rows.length - rows.length : 0;

  return (
    <div className="screen leaderboard">
      <TopBar />
      <BackBar />
      <section className="lb-hero art">
        <Img src="/art/hero-home.webp" className="hero-img" style={{ objectPosition: '60% 40%' }} />
        <div className="hero-shade left" />
        <div className="lb-hero-text">
          <div className="row kicker" style={{ color: '#9fdcff', gap: 6 }}>
            <TrophyL size={16} color="#ffc53d" /> Недельный турнир
          </div>
          <h1 className="h-display lb-title">Кто дальше?</h1>
          <div className="panel cyan countdown-box">
            <Stopwatch size={24} />
            <span>
              <span className="tiny">До конца</span>
              <b className="num">{data ? durationLong(data.endsAt - now) : '—'}</b>
            </span>
          </div>
        </div>
      </section>

      {data?.pending && (
        <div className="panel gold weekly-claim">
          <Gift size={28} color="#ffc53d" />
          <div className="grow">
            <b>Награда прошлой недели</b>
            <div className="sub">Место #{data.pending.rank}</div>
            <RewardList bundle={data.pending.reward} size={14} />
          </div>
          <Btn
            variant="gold"
            size="sm"
            onClick={async () => {
              if (await claimWeekly()) setData({ ...data, pending: null });
            }}
          >
            Забрать
          </Btn>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'top' ? 'on' : ''}`} onClick={() => setTab('top')}>
          <TrophyL size={18} /> Топ 100
        </button>
        <button className={`tab ${tab === 'friends' ? 'on' : ''}`} onClick={() => setTab('friends')}>
          <Users size={18} /> Друзья
        </button>
        <button className={`tab ${tab === 'rewards' ? 'on' : ''}`} onClick={() => setTab('rewards')}>
          <Gift size={18} /> Награды
        </button>
      </div>

      {tab !== 'rewards' && (
        <div className="panel lb-table">
          <div className="lb-row lb-headrow">
            <span>#</span>
            <span>Игрок</span>
            <span className="r">Лучший</span>
            <span className="r">Награда</span>
          </div>
          {loading && !data && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, margin: 6 }} />)}
          {data && data.rows.length === 0 && (
            <div className="empty">
              <b>{tab === 'friends' ? 'Пока без друзей' : 'Турнир только начался'}</b>
              {tab === 'friends' ? 'Пригласи друзей по ссылке — они появятся здесь.' : 'Сыграй забег, чтобы занять первое место.'}
            </div>
          )}
          {rows.map((r, i) => (
            <Fragment key={r.playerId}>
            {i > 0 && r.rank - rows[i - 1].rank > 1 && <div className="lb-gap">• • •</div>}
            <div className={`lb-row ${r.me ? 'me' : ''} ${r.rank <= 3 ? `top r${r.rank}` : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}>
              <span className="lb-rank">
                <RankBadge rank={r.rank} />
              </span>
              <span className="row lb-player">
                <Avatar url={r.avatarUrl} name={r.name} skin={r.skin} size="sm" />
                <span>
                  <b>{r.name}</b>
                  {r.me && <small>Это ты</small>}
                </span>
              </span>
              <b className="num lb-score">{fmt(r.score)}</b>
              <span className="lb-reward">{r.reward ? <MiniReward b={r.reward} /> : <span className="muted">—</span>}</span>
            </div>
            </Fragment>
          ))}
          {hidden > 0 && (
            <button className="lb-more" onClick={() => { click(); setExpanded(true); }}>
              Показать всех · ещё {hidden}
            </button>
          )}
          {data && !meInList && tab === 'top' && (
            <>
              <div className="lb-gap">• • •</div>
              <div className="lb-row me">
                <span className="lb-rank">
                  <span className="rank-num">{data.me.rank ?? '—'}</span>
                </span>
                <span className="row lb-player">
                  <Avatar url={p.avatarUrl} name={p.displayName} skin={p.selectedSkin} size="sm" />
                  <span>
                    <b>{p.displayName}</b>
                    <small>{data.me.rank ? 'Это ты' : 'Нет забегов'}</small>
                  </span>
                </span>
                <b className="num lb-score">{fmt(data.me.score)}</b>
                <span className="lb-reward">{data.me.reward ? <MiniReward b={data.me.reward} /> : <span className="muted">—</span>}</span>
              </div>
            </>
          )}
          {tab === 'friends' && (
            <div className="row" style={{ justifyContent: 'center', padding: 10 }}>
              <Btn variant="cyan" onClick={invite}>
                <Share2 size={16} /> Пригласить друга
              </Btn>
            </div>
          )}
        </div>
      )}

      {tab === 'rewards' && (
        <div className="panel week-rewards">
          <div className="tier-list">
            {cfg.leaderboard.tiers.map((t) => (
              <div key={t.id} className={`tier ${t.id === 'top1' ? 'gold' : t.id === 'top10' ? 'violet' : ''} ${data?.me.tierId === t.id ? 'mine' : ''}`}>
                <b className="tier-label">{t.label}</b>
                <span className="tier-art-wrap">
                  <TierArt reward={t.reward} />
                </span>
                <span className="tier-desc">{t.description}</span>
                <RewardList bundle={t.reward} size={14} />
              </div>
            ))}
          </div>
          <div className="sub mt-s">Начисляются после конца недели</div>
        </div>
      )}

      <div className="mt">
        <Cta onClick={() => navigate('routes')}>Принять вызов</Cta>
      </div>
    </div>
  );
}

function MiniReward({ b }: { b: NonNullable<LeaderboardView['me']['reward']> }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      {b.shards ? (
        <span className="row" style={{ gap: 2 }}>
          <Shard size={14} />
          {fmt(b.shards)}
        </span>
      ) : null}
      {b.stars ? (
        <span className="row" style={{ gap: 2 }}>
          <StarIcon size={14} />
          {fmt(b.stars)}
        </span>
      ) : null}
      {!b.shards && !b.stars && b.credits ? (
        <span className="row" style={{ gap: 2 }}>
          <CurrencyIcon kind="credits" size={14} />
          {fmt(b.credits)}
        </span>
      ) : null}
    </span>
  );
}

function TierArt({ reward }: { reward: NonNullable<LeaderboardView['me']['reward']> }) {
  if (reward.skin) return <Img src={`/art/skin-${reward.skin}.webp`} className="tier-art" />;
  if (reward.energy) return <CurrencyIcon kind="energy" size={40} />;
  if (reward.reviveTokens) return <CurrencyIcon kind="reviveTokens" size={40} />;
  if (reward.shards) return <CurrencyIcon kind="shards" size={40} />;
  return <CurrencyIcon kind="credits" size={40} />;
}
