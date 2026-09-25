import { ChevronRight, Crown as CrownL, Star, Zap, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ShopProduct } from '../api/types';
import { track } from '../analytics';
import { fetchShop, handleError, setProfile } from '../state/actions';
import { useStore, type ShopTab } from '../state/store';
import { Btn, Img, PriceTag, TopBar, click } from '../ui/common';
import { Bolt, Helmet, PassCard, ReviveIcon, StarIcon, Crown, TgStar } from '../ui/icons';
import { ProductArt } from '../ui/ProductArt';
import { fmt } from '../ui/format';

const TABS: { id: ShopTab; label: string; icon: React.ReactNode }[] = [
  { id: 'stars', label: 'Звёзды', icon: <Star fill="currentColor" /> },
  { id: 'energy', label: 'Энергия', icon: <Zap fill="currentColor" /> },
  { id: 'skins', label: 'Скины', icon: <Helmet size={20} /> },
  { id: 'pass', label: 'Пропуск', icon: <CrownL /> },
];

function useShop() {
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [error, setError] = useState(false);
  const profile = useStore((s) => s.profile);
  const load = () => {
    setError(false);
    fetchShop()
      .then((r) => {
        setProducts(r.products);
        setProfile(r.profile);
      })
      .catch((e) => {
        setError(true);
        handleError(e);
      });
  };
  useEffect(load, []);
  // Purchases change availability; refresh after balances move.
  useEffect(() => {
    if (products) fetchShop().then((r) => setProducts(r.products)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.purchases && JSON.stringify(profile.purchases)]);
  return { products, error, reload: load };
}

function StarCard({ p }: { p: ShopProduct }) {
  const openModal = useStore((s) => s.openModal);
  const best = Boolean(p.badge);
  return (
    <button
      className={`panel star-card ${best ? 'gold best' : ''}`}
      onClick={() => {
        click();
        track('product_click', { productId: p.productId });
        openModal({ type: 'purchase', productId: p.productId });
      }}
    >
      {best && <div className="best-badge">Выгодно</div>}
      {!p.available && <span className="owned-tag">Куплено</span>}
      <div className="row star-amount">
        <StarIcon size={20} />
        <b className="num">{p.title}</b>
      </div>
      {p.bonusPercent ? <span className="chip violet bonus">+{p.bonusPercent}%</span> : null}
      <ProductArt image={p.image} size={72} />
      <span className={`price-btn ${best ? 'gold' : ''}`}>
        <PriceTag price={p.price} />
      </span>
    </button>
  );
}

function ProductRow({ p }: { p: ShopProduct }) {
  const openModal = useStore((s) => s.openModal);
  return (
    <button
      className="panel product-row"
      disabled={!p.available}
      onClick={() => {
        click();
        track('product_click', { productId: p.productId });
        openModal({ type: 'purchase', productId: p.productId });
      }}
    >
      <ProductArt image={p.image} size={60} />
      <div className="grow" style={{ textAlign: 'left' }}>
        <b className="pr-title">{p.title}</b>
        {p.subtitle && !p.bonusPercent && <div className="sub">{p.subtitle}</div>}
        {p.bonusPercent ? <span className="chip violet" style={{ marginTop: 4 }}>+{p.bonusPercent}%</span> : null}
      </div>
      <span className="price-btn">{p.available ? <PriceTag price={p.price} /> : 'Куплено'}</span>
    </button>
  );
}

export function Shop() {
  const tab = useStore((s) => s.shopTab);
  const cfg = useStore((s) => s.config)!;
  const profile = useStore((s) => s.profile)!;
  const openModal = useStore((s) => s.openModal);
  const navigate = useStore((s) => s.navigate);
  const { products, error, reload } = useShop();
  useEffect(() => track('shop_view', { tab }), [tab]);
  const byTab = (t: ShopTab) => products?.filter((p) => p.tab === t) ?? [];
  const stars = products?.filter((p) => p.type === 'stars') ?? [];
  const vip = products?.find((p) => p.productId === 'vip_bundle');
  const pass = products?.find((p) => p.type === 'pass');
  const popular = products?.filter((p) => p.popular) ?? [];

  return (
    <div className="screen shop">
      <TopBar />
      <section className="shop-hero art">
        <Img src="/art/shop-hero.webp" className="hero-img" style={{ objectPosition: '70% 30%' }} />
        <div className="hero-shade left" />
        <div className="shop-hero-text">
          <h1 className="h-chrome shop-title">Магазин</h1>
        </div>
      </section>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => {
              click();
              useStore.setState({ shopTab: t.id });
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {error && !products && (
        <div className="panel empty mt">
          <b>Магазин не загрузился</b>
          Проверьте соединение.
          <div className="mt">
            <Btn variant="cyan" onClick={reload}>
              Повторить
            </Btn>
          </div>
        </div>
      )}
      {!products && !error && (
        <div className="star-grid mt">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 190 }} />
          ))}
        </div>
      )}

      {products && tab === 'stars' && (
        <>
          <div className="section-note">
            <TgStar size={14} /> Оплата через Telegram Stars
          </div>
          <div className="star-grid">
            {stars.map((p) => (
              <StarCard key={p.productId} p={p} />
            ))}
          </div>
          <div className="section-head">
            <h2 className="h-section">Спецпредложения</h2>
          </div>
          <div className="offers">
            {vip && (
              <button
                className="panel violet offer"
                disabled={!vip.available}
                onClick={() => {
                  click();
                  openModal({ type: 'purchase', productId: vip.productId });
                }}
              >
                <div className="offer-head">
                  <b>VIP набор</b>
                  <span className="chip gold">
                    <Crown size={12} /> Выгода
                  </span>
                </div>
                <div className="offer-body">
                  <ul className="offer-list">
                    <li>
                      <StarIcon size={18} /> <b className="num">{fmt(vip.contents.stars ?? 0)}</b>
                    </li>
                    <li>
                      <Bolt size={18} /> x{vip.contents.energy} Энергия
                    </li>
                    <li>
                      <ReviveIcon size={18} /> x{vip.contents.reviveTokens} Возрождение
                    </li>
                    <li>
                      <Helmet size={18} style={{ color: '#c07bff' }} /> Скин «{cfg.skins.find((s) => s.id === vip.contents.skin)?.name}»
                    </li>
                  </ul>
                  <ProductArt image="vip" />
                </div>
                <span className="price-btn gold wide">{vip.available ? <PriceTag price={vip.price} /> : 'Куплено'}</span>
              </button>
            )}
            {pass && (
              <button
                className="panel violet offer"
                onClick={() => {
                  click();
                  if (pass.available) openModal({ type: 'purchase', productId: pass.productId });
                  else navigate('pass');
                }}
              >
                <div className="offer-head">
                  <b>Сезонный пропуск</b>
                </div>
                <div className="kicker" style={{ fontSize: 11 }}>
                  Сезон {profile.pass.number}
                </div>
                <div className="h-display" style={{ fontSize: 20 }}>
                  {profile.pass.name}
                </div>
                <ul className="offer-list small">
                  <li>
                    <Crown size={14} /> 30 уровней наград
                  </li>
                  <li>
                    <StarIcon size={14} /> Звёзды и осколки
                  </li>
                  <li>
                    <Helmet size={14} style={{ color: '#9fdcff' }} /> Уникальный скин
                  </li>
                </ul>
                <span className="offer-pass-art" aria-hidden>
                  <PassCard size={78} />
                </span>
                <span className="price-btn violet wide">{pass.available ? <PriceTag price={pass.price} /> : 'Активен'}</span>
              </button>
            )}
          </div>
          {popular.length > 0 && (
            <>
              <div className="section-head">
                <h2 className="h-section">Популярное</h2>
              </div>
              <div className="popular">
                {popular.map((p) => (
                  <button
                    key={p.productId}
                    className="panel popular-card"
                    disabled={!p.available}
                    onClick={() => {
                      click();
                      openModal({ type: 'purchase', productId: p.productId });
                    }}
                  >
                    <span className="pop-art">
                      <ProductArt image={p.image} size={40} />
                    </span>
                    <span className="pop-body">
                      <b>{p.title}</b>
                      <span className="price-btn">
                        {p.available ? <PriceTag price={p.price} /> : 'Куплено'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {products && tab === 'energy' && (
        <>
          <div className="section-note">Энергия сверх лимита сохраняется</div>
          <div className="col">
            {byTab('energy').map((p) => (
              <ProductRow key={p.productId} p={p} />
            ))}
          </div>
        </>
      )}

      {products && tab === 'skins' && (
        <>
          <div className="section-note">Только внешний вид — без преимуществ</div>
          <div className="skin-grid">
            {cfg.skins.map((s) => {
              const owned = profile.ownedSkins.includes(s.id);
              const equipped = profile.selectedSkin === s.id;
              return (
                <button
                  key={s.id}
                  className={`panel skin-tile ${s.rarity} ${equipped ? 'cyan' : ''}`}
                  onClick={() => {
                    click();
                    openModal({ type: 'skin', skinId: s.id });
                  }}
                >
                  <Img src={`/art/skin-${s.id}.webp`} className="skin-tile-art" />
                  <b>{s.name}</b>
                  <span className={`rarity ${s.rarity}`}>{rarityLabel(s.rarity)}</span>
                  <span className="skin-tile-status">
                    {equipped ? 'Надет' : owned ? 'Открыт' : s.price ? <PriceTag price={s.price} /> : <><Lock size={12} /> {sourceLabel(s.source)}</>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="col mt">
            {byTab('skins').map((p) => (
              <ProductRow key={p.productId} p={p} />
            ))}
          </div>
        </>
      )}

      {products && tab === 'pass' && pass && (
        <div className="panel gold pass-offer mt">
          <ProductArt image="pass" size={110} />
          <div className="grow">
            <div className="kicker">Сезон {profile.pass.number}</div>
            <div className="h-display" style={{ fontSize: 24 }}>
              {profile.pass.name}
            </div>
            <div className="sub">30 уровней наград + эксклюзивный скин</div>
            <div className="row mt-s" style={{ gap: 8 }}>
              {pass.available ? (
                <Btn variant="gold" onClick={() => openModal({ type: 'purchase', productId: pass.productId })}>
                  <PriceTag price={pass.price} />
                </Btn>
              ) : (
                <span className="chip gold">Премиум активен</span>
              )}
              <Btn variant="ghost" onClick={() => navigate('pass')}>
                Награды <ChevronRight size={14} />
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function rarityLabel(r: string) {
  return ({ base: 'Базовый', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' } as Record<string, string>)[r] ?? r;
}
export function sourceLabel(s: string) {
  return ({ pass: 'Пропуск, ур. 30', bundle: 'VIP набор', leaderboard: 'Топ-1 недели', fragments: 'Фрагменты', default: 'Базовый', shop: 'Магазин' } as Record<string, string>)[s] ?? s;
}
