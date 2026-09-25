import { AlertTriangle, ArrowRight, Check, Clock, Lock, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { planUpgradeAll, productById, skinById, slotStatLines, upgradeCost } from '@void-rush/shared';
import { track } from '../analytics';
import type { OrderView, PassView } from '../api/types';
import { claimPass, claimStreak, equipSkin, fetchPass, purchase, saveSettings, unlockSkin, upgradeAll, upgradeGear, type PurchaseOutcome } from '../state/actions';
import { useStore, type Modal as ModalState } from '../state/store';
import { Btn, Cta, Img, Modal, PriceTag, RewardList, click } from '../ui/common';
import { Bolt, CurrencyIcon, Gift } from '../ui/icons';
import { GearIcon } from '../ui/gearIcons';
import { ProductArt } from '../ui/ProductArt';
import { RunnerView } from '../ui/RunnerView';
import { clock, fmt, pluralN, REWARD_LABEL, rewardEntries, RUNS } from '../ui/format';
import { RewardCell } from '../screens/Pass';
import { rarityLabel, sourceLabel } from '../screens/Shop';

export function ModalHost() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  switch (modal.type) {
    case 'energy':
      return <EnergyModal />;
    case 'currency':
      return <CurrencyModal m={modal} />;
    case 'streak':
      return <StreakModal />;
    case 'settings':
      return <SettingsModal />;
    case 'purchase':
      return <PurchaseModal productId={modal.productId} />;
    case 'upgrade':
      return <UpgradeModal slot={modal.slot} />;
    case 'upgradeAll':
      return <UpgradeAllModal />;
    case 'skin':
      return <SkinModal skinId={modal.skinId} />;
    case 'passTrack':
      return <PassTrackModal />;
    case 'shards':
      return <ShardsModal />;
    case 'notice':
      return <NoticeModal m={modal} />;
  }
}

const close = () => useStore.getState().closeModal();

function EnergyModal() {
  const p = useStore((s) => s.profile)!;
  const cfg = useStore((s) => s.config)!;
  const navigate = useStore((s) => s.navigate);
  const at = useStore((s) => s.profileAt);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const next = Math.max(0, p.energy.nextInSec - (Date.now() - at) / 1000);
  const refill = cfg.products.filter((x) => x.type === 'energy');
  return (
    <Modal onClose={close}>
      <div className="center">
        <Bolt size={56} />
        <h3 className="modal-title">{p.energy.value < 5 ? 'Недостаточно энергии' : 'Энергия'}</h3>
        <div className="energy-big num">
          {p.energy.value}
          {p.energy.value <= p.energy.cap && <span className="muted">/{p.energy.cap}</span>}
        </div>
        <div className="sub">
          {p.energy.value > p.energy.cap ? `Запас сверх лимита (${p.energy.cap}) — восстановление на паузе` : p.energy.value >= p.energy.cap ? 'Энергия полная' : <span className="row" style={{ gap: 4, justifyContent: 'center' }}><Clock size={14} /> +1 через {clock(next)} · полное восстановление ~{Math.ceil(((p.energy.cap - p.energy.value) * p.energy.regenSec) / 60)} мин</span>}
        </div>
        <div className="sub mt-s">Стандартный забег стоит {cfg.routes.neon.energyCost} энергии. Энергия восстанавливается сама.</div>
      </div>
      <div className="col mt">
        {refill.map((prod) => (
          <button
            key={prod.productId}
            className="panel product-row"
            onClick={() => {
              click();
              useStore.getState().openModal({ type: 'purchase', productId: prod.productId });
            }}
          >
            <ProductArt image={prod.image} size={44} />
            <div className="grow" style={{ textAlign: 'left' }}>
              <b>{prod.title}</b>
              <div className="sub">{prod.subtitle}</div>
            </div>
            <span className="price-btn">
              <PriceTag price={prod.price} />
            </span>
          </button>
        ))}
      </div>
      <div className="actions">
        <Btn variant="ghost" onClick={close}>
          Отмена
        </Btn>
        <Btn
          onClick={() => {
            close();
            useStore.setState({ shopTab: 'energy' });
            navigate('shop');
          }}
        >
          В магазин
        </Btn>
      </div>
    </Modal>
  );
}

const CUR_NAME: Record<string, string> = { credits: 'кредитов', shards: 'осколков', stars: 'звёзд', reviveTokens: 'жетонов возрождения', skinFragments: 'фрагментов' };

function CurrencyModal({ m }: { m: Extract<ModalState, { type: 'currency' }> }) {
  const navigate = useStore((s) => s.navigate);
  const goShop = () => {
    close();
    useStore.setState({ shopTab: m.currency === 'stars' ? 'stars' : 'energy' });
    navigate(m.currency === 'shards' || m.currency === 'skinFragments' ? 'routes' : 'shop');
  };
  return (
    <Modal onClose={close} tone="violet">
      <div className="center">
        <CurrencyIcon kind={m.currency} size={56} />
        <h3 className="modal-title">Не хватает {CUR_NAME[m.currency] ?? ''}</h3>
      </div>
      <div className="kv">
        <span>Нужно</span>
        <b className="num row" style={{ gap: 4 }}>
          <CurrencyIcon kind={m.currency} size={16} /> {fmt(m.required)}
        </b>
      </div>
      <div className="kv">
        <span>У тебя</span>
        <b className="num row red-text" style={{ gap: 4 }}>
          <CurrencyIcon kind={m.currency} size={16} /> {fmt(m.current)}
        </b>
      </div>
      <div className="sub center mt-s">{m.currency === 'shards' || m.currency === 'skinFragments' ? 'Добывается в забегах и заданиях.' : 'Пополни запас в магазине.'}</div>
      <div className="actions">
        <Btn variant="ghost" onClick={close}>
          Закрыть
        </Btn>
        <Btn variant="gold" onClick={goShop}>
          {m.currency === 'shards' || m.currency === 'skinFragments' ? 'В забег' : 'В магазин'}
        </Btn>
      </div>
    </Modal>
  );
}

function ShardsModal() {
  const navigate = useStore((s) => s.navigate);
  const p = useStore((s) => s.profile)!;
  return (
    <Modal onClose={close} tone="violet">
      <div className="center">
        <CurrencyIcon kind="shards" size={56} />
        <h3 className="modal-title">Осколки пустоты</h3>
        <div className="energy-big num">{fmt(p.balances.shards)}</div>
        <div className="sub">Главный ресурс забега. Собирай их на трассе, в заданиях и событиях. Нужны для продвинутых улучшений снаряжения.</div>
      </div>
      <div className="actions">
        <Btn variant="ghost" onClick={close}>
          Закрыть
        </Btn>
        <Btn
          variant="violet"
          onClick={() => {
            close();
            navigate('routes');
          }}
        >
          В забег
        </Btn>
      </div>
    </Modal>
  );
}

function StreakModal() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const busy = useStore((s) => s.busy.streak);
  const today = p.streak.dayIndex;
  return (
    <Modal onClose={close} tone="gold">
      <div className="center">
        <Gift size={52} />
        <h3 className="modal-title">Серия дней: {p.streak.count}</h3>
        <div className="sub">Заходи каждый день — награды растут. Пропуск дня сбрасывает серию.</div>
      </div>
      <div className="streak-grid mt">
        {cfg.streak.rewards.map((r, i) => {
          const done = i < today || (i === today && !p.streak.claimable);
          const current = i === today && p.streak.claimable;
          return (
            <div key={i} className={`streak-day ${done ? 'done' : ''} ${current ? 'current' : ''} ${i === 6 ? 'big' : ''}`}>
              <span className="tiny">День {i + 1}</span>
              <RewardList bundle={r} size={18} column />
              {done && <Check size={16} className="green-text" />}
            </div>
          );
        })}
      </div>
      <div className="mt">
        {p.streak.claimable ? (
          <Cta small loading={busy} onClick={async () => { if (await claimStreak()) close(); }}>
            Забрать
          </Cta>
        ) : (
          <div className="sub center">Награда за сегодня получена. Возвращайся завтра!</div>
        )}
      </div>
    </Modal>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="kv toggle-row"
      onClick={() => {
        click();
        onChange(!on);
      }}
    >
      <span>{label}</span>
      <span className={`toggle ${on ? 'on' : ''}`}>
        <i />
      </span>
    </button>
  );
}

function SettingsModal() {
  const p = useStore((s) => s.profile)!;
  const s = p.settings;
  const navigate = useStore((st) => st.navigate);
  return (
    <Modal onClose={close}>
      <h3 className="modal-title">Профиль</h3>
      <div className="center sub">
        {p.displayName} · Ур. {p.level} · {pluralN(p.stats.runs, RUNS)} · {pluralN(p.stats.finishes, ['финиш', 'финиша', 'финишей'])}
      </div>
      <div className="mt">
        <Toggle label="Музыка" on={s.music} onChange={(v) => void saveSettings({ music: v })} />
        <Toggle label="Звуки" on={s.sfx} onChange={(v) => void saveSettings({ sfx: v })} />
        <Toggle label="Вибрация" on={s.haptics} onChange={(v) => void saveSettings({ haptics: v })} />
        <Toggle label="Меньше тряски камеры" on={s.reducedShake} onChange={(v) => void saveSettings({ reducedShake: v })} />
        <Toggle label="Меньше вспышек" on={s.reducedFlash} onChange={(v) => void saveSettings({ reducedFlash: v })} />
        <div className="kv">
          <span>Графика</span>
          <span className="row" style={{ gap: 4 }}>
            {(['auto', 'low', 'medium', 'high'] as const).map((g) => (
              <button
                key={g}
                className={`seg ${s.graphics === g ? 'on' : ''}`}
                onClick={() => {
                  click();
                  localStorage.removeItem('vr_tier');
                  void saveSettings({ graphics: g });
                }}
              >
                {{ auto: 'Авто', low: 'Низ', medium: 'Сред', high: 'Выс' }[g]}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="actions">
        <Btn
          variant="ghost"
          onClick={() => {
            close();
            navigate('howto');
          }}
        >
          Как играть
        </Btn>
        <Btn
          onClick={() => {
            close();
            navigate('leaderboard');
          }}
        >
          Турнир
        </Btn>
      </div>
    </Modal>
  );
}

function newKey() {
  return `pk_${crypto.getRandomValues(new Uint32Array(3)).join('')}`.slice(0, 40);
}

/** Purchase flow UI: detail → confirm → pending → success / error with retry (same idempotency key). */
function PurchaseModal({ productId }: { productId: string }) {
  const cfg = useStore((s) => s.config)!;
  const meta = useStore((s) => s.meta);
  const product = productById(cfg, productId);
  const [stage, setStage] = useState<'confirm' | 'pending' | 'sandbox' | 'success' | 'error'>('confirm');
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);
  const keyRef = useRef(newKey());
  const sandboxResolve = useRef<((ok: boolean) => void) | null>(null);
  if (!product) return null;
  const pay = async () => {
    setStage('pending');
    const r = await purchase(productId, keyRef.current, () => {
      setStage('sandbox');
      return new Promise<boolean>((res) => (sandboxResolve.current = res));
    });
    setOutcome(r);
    if (r.status === 'paid') setStage('success');
    else if (r.status === 'cancelled') {
      keyRef.current = newKey();
      if (useStore.getState().modal?.type === 'purchase') setStage('confirm');
    } else setStage('error');
  };
  const xtr = product.price.type === 'xtr';
  return (
    <Modal onClose={stage === 'pending' ? undefined : close} tone={product.type === 'pass' || product.badge ? 'gold' : 'violet'}>
      {stage === 'confirm' && (
        <>
          <div className="center">
            <div className="purchase-art">
              <ProductArt image={product.image} size={110} />
            </div>
            <h3 className="modal-title">{product.type === 'stars' ? `${product.title} звёзд` : product.title}</h3>
            {product.subtitle && <div className="sub">{product.subtitle}</div>}
          </div>
          <div className="panel contents mt">
            <div className="tiny">Содержимое</div>
            {rewardEntries(product.contents).map((e) => (
              <div key={e.key} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 6 }}>
                  <CurrencyIcon kind={e.key} size={18} /> {REWARD_LABEL[e.key]}
                </span>
                <b className="num">{e.key === 'skin' ? skinById(cfg, e.skin!)?.name : e.key === 'premiumPass' ? 'Сезон' : fmt(e.amount)}</b>
              </div>
            ))}
            {product.bonusPercent ? <div className="green-text" style={{ fontSize: 12 }}>Бонус +{product.bonusPercent}%</div> : null}
          </div>
          <div className="kv mt">
            <span>Цена</span>
            <b>
              <PriceTag price={product.price} />
            </b>
          </div>
          {xtr && <div className="sub center mt-s">Оплата через Telegram Stars. {meta?.payments.sandbox && !meta.payments.telegram ? 'Сервер в режиме разработки — используется тестовая оплата.' : ''}</div>}
          <div className="actions">
            <Btn variant="ghost" onClick={close}>
              Отмена
            </Btn>
            <Btn variant="gold" onClick={() => void pay()}>
              {xtr ? 'Оплатить' : 'Купить'}
            </Btn>
          </div>
        </>
      )}
      {stage === 'pending' && (
        <div className="center" style={{ padding: 20 }}>
          <div className="spinner" style={{ width: 44, height: 44, margin: '0 auto' }} />
          <h3 className="modal-title mt">Обработка платежа</h3>
          <div className="sub">Ожидаем подтверждение сервера. Не закрывайте приложение.</div>
        </div>
      )}
      {stage === 'sandbox' && (
        <div className="center">
          <AlertTriangle size={40} color="#ffc53d" />
          <h3 className="modal-title">Тестовая оплата</h3>
          <div className="sub">
            Сервер запущен без токена Telegram-бота, поэтому реальный счёт не создаётся. Подтвердите, чтобы проверить выдачу товара.
          </div>
          <div className="kv mt">
            <span>{product.title}</span>
            <PriceTag price={product.price} />
          </div>
          <div className="actions">
            <Btn variant="ghost" onClick={() => sandboxResolve.current?.(false)}>
              Отмена
            </Btn>
            <Btn variant="gold" onClick={() => sandboxResolve.current?.(true)}>
              Подтвердить
            </Btn>
          </div>
        </div>
      )}
      {stage === 'success' && outcome?.status === 'paid' && (
        <SuccessView order={outcome.order} />
      )}
      {stage === 'error' && (
        <div className="center">
          <AlertTriangle size={44} color="#ff6a6a" />
          <h3 className="modal-title">{outcome?.status === 'pending' ? 'Платёж ещё обрабатывается' : 'Покупка не прошла'}</h3>
          <div className="sub">{outcome?.status === 'pending' ? 'Товар будет начислен автоматически, как только Telegram подтвердит оплату.' : (outcome && 'message' in outcome ? outcome.message : undefined) ?? 'Деньги не списаны. Попробуйте ещё раз.'}</div>
          <div className="actions">
            <Btn variant="ghost" onClick={close}>
              Закрыть
            </Btn>
            <Btn variant="cyan" onClick={() => void pay()}>
              <RefreshCw size={16} /> Повторить
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SuccessView({ order }: { order: OrderView }) {
  return (
    <div className="center success-view">
      <div className="success-burst">
        <Check size={40} strokeWidth={3} />
      </div>
      <h3 className="modal-title">Готово!</h3>
      <div className="sub">Начислено:</div>
      <div className="row mt-s" style={{ justifyContent: 'center' }}>
        {order.granted && <RewardList bundle={order.granted} size={24} />}
      </div>
      <div className="actions">
        <Btn variant="cyan" onClick={close}>
          Отлично
        </Btn>
      </div>
    </div>
  );
}

function UpgradeModal({ slot }: { slot: import('@void-rush/shared').GearSlot }) {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const busy = useStore((s) => s.busy[`upgrade:${slot}`]);
  const level = p.gear[slot];
  const cost = upgradeCost(slot, level, cfg);
  const before = slotStatLines(slot, level, cfg);
  const after = cost ? slotStatLines(slot, level + 1, cfg) : null;
  const lackCredits = cost ? cost.credits > p.balances.credits : false;
  const lackShards = cost ? cost.shards > p.balances.shards : false;
  return (
    <Modal onClose={close}>
      <div className="center">
        <GearIcon slot={slot} size={72} />
        <h3 className="modal-title">{cfg.gear[slot].name}</h3>
        <div className="sub">{cfg.gear[slot].description}</div>
      </div>
      <div className="upgrade-levels">
        <span className="lv">Ур. {level}</span>
        {after && (
          <>
            <ArrowRight size={20} className="cyan-text" />
            <span className="lv next">Ур. {level + 1}</span>
          </>
        )}
      </div>
      <div className="stat-compare">
        {before.map((b, i) => (
          <div key={b.label} className="kv">
            <span>{b.label}</span>
            <span className="row" style={{ gap: 6 }}>
              <b>{b.value}</b>
              {after && (
                <>
                  <ArrowRight size={14} className="muted" /> <b className="green-text">{after[i].value}</b>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      {cost ? (
        <>
          <div className="panel cost-box mt">
            <span className="tiny">Стоимость</span>
            <div className="row" style={{ gap: 14, justifyContent: 'center' }}>
              <b className={`row num ${lackCredits ? 'red-text' : ''}`} style={{ gap: 4 }}>
                <CurrencyIcon kind="credits" /> {fmt(cost.credits)}
              </b>
              {cost.shards > 0 && (
                <b className={`row num ${lackShards ? 'red-text' : ''}`} style={{ gap: 4 }}>
                  <CurrencyIcon kind="shards" /> {fmt(cost.shards)}
                </b>
              )}
            </div>
            {(lackCredits || lackShards) && <div className="sub red-text">Не хватает ресурсов</div>}
          </div>
          <div className="actions">
            <Btn variant="ghost" onClick={close}>
              Отмена
            </Btn>
            <Btn
              variant="violet"
              loading={busy}
              onClick={async () => {
                if (lackCredits || lackShards) {
                  useStore.getState().openModal({ type: 'currency', currency: lackCredits ? 'credits' : 'shards', required: lackCredits ? cost.credits : cost.shards, current: lackCredits ? p.balances.credits : p.balances.shards });
                  return;
                }
                if (await upgradeGear(slot, level)) close();
              }}
            >
              Улучшить
            </Btn>
          </div>
        </>
      ) : (
        <div className="sub center mt">Максимальный уровень достигнут</div>
      )}
    </Modal>
  );
}

function UpgradeAllModal() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const busy = useStore((s) => s.busy.upgradeAll);
  const plan = useMemo(() => planUpgradeAll(p.gear, p.balances, cfg), [p.gear, p.balances, cfg]);
  const grouped = Object.entries(plan.result).filter(([slot, lv]) => lv !== p.gear[slot as keyof typeof p.gear]);
  return (
    <Modal onClose={close}>
      <h3 className="modal-title">Улучшить всё</h3>
      <div className="sub center">Мы подобрали улучшения, которые ты можешь позволить. Баланс не тратится без подтверждения.</div>
      <div className="mt">
        {grouped.length === 0 && <div className="empty">Нет доступных улучшений</div>}
        {grouped.map(([slot, lv]) => (
          <div key={slot} className="kv">
            <span className="row" style={{ gap: 8 }}>
              <GearIcon slot={slot as never} size={28} /> {cfg.gear[slot as keyof typeof cfg.gear].name}
            </span>
            <b>
              {p.gear[slot as keyof typeof p.gear]} <ArrowRight size={12} /> <span className="green-text">Ур. {lv}</span>
            </b>
          </div>
        ))}
      </div>
      <div className="panel cost-box mt">
        <span className="tiny">Итого</span>
        <div className="row" style={{ gap: 14, justifyContent: 'center' }}>
          <b className="row num" style={{ gap: 4 }}>
            <CurrencyIcon kind="credits" /> {fmt(plan.total.credits)}
          </b>
          <b className="row num" style={{ gap: 4 }}>
            <CurrencyIcon kind="shards" /> {fmt(plan.total.shards)}
          </b>
        </div>
      </div>
      <div className="actions">
        <Btn variant="ghost" onClick={close}>
          Отмена
        </Btn>
        <Btn variant="gold" disabled={plan.steps.length === 0} loading={busy} onClick={async () => { if (await upgradeAll(plan.total)) close(); }}>
          Подтвердить ({plan.steps.length})
        </Btn>
      </div>
    </Modal>
  );
}

function SkinModal({ skinId }: { skinId?: string }) {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const busyEquip = useStore((s) => s.busy.equip);
  const busyUnlock = useStore((s) => s.busy.unlockSkin);
  const navigate = useStore((s) => s.navigate);
  const [sel, setSel] = useState(skinId ?? p.selectedSkin);
  const [compare, setCompare] = useState(false);
  const skin = skinById(cfg, sel) ?? cfg.skins[0];
  const equipped = skinById(cfg, p.selectedSkin) ?? cfg.skins[0];
  const owned = p.ownedSkins.includes(skin.id);
  useEffect(() => track('skin_preview', { skinId: sel }), [sel]);
  const bundle = cfg.products.find((x) => x.contents.skin === skin.id);
  return (
    <Modal onClose={close} tone="violet" wide>
      <div className="skin-preview">
        <RunnerView skin={compare ? equipped : skin} className="skin-viewer" />
        <div className="skin-preview-info">
          <span className={`rarity ${skin.rarity}`}>{rarityLabel(skin.rarity)}</span>
          <h3 className="modal-title" style={{ textAlign: 'left' }}>
            {compare ? equipped.name : skin.name}
          </h3>
          <div className="sub">{compare ? 'Сейчас надет' : skin.description}</div>
          <div className="swatches">
            {Object.values(skin.colors).map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </div>
          <div className="sub" style={{ fontSize: 11 }}>
            Скин меняет только внешний вид, свечение и шлейф.
          </div>
        </div>
      </div>
      <div className="hscroll skin-picker">
        {cfg.skins.map((s) => (
          <button key={s.id} className={`skin-pick ${s.id === sel ? 'on' : ''} ${p.ownedSkins.includes(s.id) ? '' : 'locked'}`} onClick={() => { click(); setSel(s.id); setCompare(false); }}>
            <Img src={`/art/avatar-${s.id}.webp`} />
            {p.selectedSkin === s.id && <i className="cell-check"><Check size={10} strokeWidth={4} /></i>}
            {!p.ownedSkins.includes(s.id) && <i className="cell-lock"><Lock size={10} /></i>}
          </button>
        ))}
      </div>
      <div className="actions">
        {sel !== p.selectedSkin && (
          <Btn variant="ghost" onClick={() => setCompare((c) => !c)}>
            {compare ? 'Показать новый' : 'Сравнить'}
          </Btn>
        )}
        {owned ? (
          <Btn variant="cyan" disabled={p.selectedSkin === skin.id} loading={busyEquip} onClick={() => void equipSkin(skin.id)}>
            {p.selectedSkin === skin.id ? 'Надет' : 'Надеть'}
          </Btn>
        ) : skin.price ? (
          <Btn variant="gold" loading={busyUnlock} onClick={() => void unlockSkin(skin.id)}>
            {skin.price.type === 'fragments' ? `Собрать (${p.balances.skinFragments}/${skin.price.amount})` : 'Купить'} <PriceTag price={skin.price} />
          </Btn>
        ) : bundle ? (
          <Btn variant="gold" onClick={() => useStore.getState().openModal({ type: 'purchase', productId: bundle.productId })}>
            {bundle.title}
          </Btn>
        ) : (
          <Btn
            variant="ghost"
            onClick={() => {
              close();
              navigate(skin.source === 'pass' ? 'pass' : 'leaderboard');
            }}
          >
            <Lock size={14} /> {sourceLabel(skin.source)}
          </Btn>
        )}
      </div>
    </Modal>
  );
}

function PassTrackModal() {
  const [pass, setPass] = useState<PassView | null>(null);
  useEffect(() => {
    fetchPass().then((r) => setPass(r.pass)).catch(() => undefined);
  }, []);
  const claim = async (level: number, t: 'free' | 'premium') => {
    const r = await claimPass(level, t);
    if (r) setPass(r.pass);
  };
  return (
    <Modal onClose={close} tone="gold" wide>
      <h3 className="modal-title">Все награды сезона</h3>
      {!pass && <div className="skeleton" style={{ height: 300 }} />}
      {pass && (
        <div className="track-list">
          <div className="track-row head">
            <span>Ур.</span>
            <span>Бесплатно</span>
            <span>Премиум</span>
          </div>
          {pass.levels.map((l) => (
            <div key={l.level} className={`track-row ${l.reached ? 'reached' : ''}`}>
              <span className="lvl-badge">{l.level}</span>
              <RewardCell reward={l.free} state={l.claimedFree ? 'claimed' : l.reached ? 'claimable' : 'future'} onClaim={() => void claim(l.level, 'free')} />
              <RewardCell premium reward={l.premium} state={l.claimedPremium ? 'claimed' : !pass.premium ? 'locked' : l.reached ? 'claimable' : 'future'} onClaim={() => void claim(l.level, 'premium')} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function NoticeModal({ m }: { m: Extract<ModalState, { type: 'notice' }> }) {
  return (
    <Modal onClose={close}>
      <h3 className="modal-title">{m.title}</h3>
      <div className="sub center">{m.message}</div>
      <div className="actions">
        <Btn variant="ghost" onClick={close}>
          Закрыть
        </Btn>
        {m.action && (
          <Btn
            variant="cyan"
            onClick={() => {
              close();
              m.action!.run();
            }}
          >
            {m.action.label}
          </Btn>
        )}
      </div>
    </Modal>
  );
}

