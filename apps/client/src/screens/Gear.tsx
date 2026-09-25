import { ChevronsUp, ChevronRight, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GEAR_SLOTS, displayStats, planUpgradeAll, skinById, upgradeCost, type GearSlot } from '@void-rush/shared';
import { track } from '../analytics';
import { useStore } from '../state/store';
import { Cta, Img, TopBar, click } from '../ui/common';
import { BoostIcon, Shard, StarIcon, Target } from '../ui/icons';
import { GearIcon } from '../ui/gearIcons';
import { RunnerView } from '../ui/RunnerView';

function SlotCard({ slot, highlight }: { slot: GearSlot; highlight: boolean }) {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const openModal = useStore((s) => s.openModal);
  const level = p.gear[slot];
  const cost = upgradeCost(slot, level, cfg);
  const affordable = cost && p.balances.credits >= cost.credits && p.balances.shards >= cost.shards;
  const max = cfg.gear[slot].maxLevel;
  return (
    <button
      className={`panel gear-card ${affordable ? 'upgradable' : ''} ${highlight && affordable ? 'coach-glow' : ''}`}
      onClick={() => {
        click();
        openModal({ type: 'upgrade', slot });
      }}
    >
      <div className="gear-name">{cfg.gear[slot].name}</div>
      <div className="gear-body">
        <GearIcon slot={slot} size={54} />
        <span className={`gear-up ${affordable ? 'on' : ''} ${!cost ? 'max' : ''}`}>{cost ? <ChevronsUp size={18} /> : 'MAX'}</span>
      </div>
      <div className="gear-foot">
        <b key={level} className="gear-lv num bump">Ур. {level}</b>
        <div className="pips">
          {Array.from({ length: max }, (_, i) => (
            <i key={i} className={i < level ? 'on' : ''} />
          ))}
        </div>
      </div>
    </button>
  );
}

export function Gear() {
  const cfg = useStore((s) => s.config)!;
  const p = useStore((s) => s.profile)!;
  const openModal = useStore((s) => s.openModal);
  const highlight = useStore((s) => s.gearHighlight);
  const skin = skinById(cfg, p.selectedSkin) ?? cfg.skins[0];
  const stats = displayStats(p.gear, cfg);
  const plan = useMemo(() => planUpgradeAll(p.gear, p.balances, cfg), [p.gear, p.balances, cfg]);
  const featured = cfg.skins.filter((s) => s.id !== 'void_guard');
  const [slide, setSlide] = useState(0);
  const f = featured[slide % featured.length];

  useEffect(() => {
    track('gear_view');
    const t = setInterval(() => setSlide((x) => x + 1), 4500);
    return () => clearInterval(t);
  }, []);

  const left: GearSlot[] = ['suit', 'core', 'boots'];
  const right: GearSlot[] = ['shield', 'magnet', 'boost'];
  return (
    <div className="screen gear">
      <TopBar />
      <header className="gear-head">
        <div>
          <h1 className="h-display gear-title">Снаряжение</h1>
          <div className="gear-sub">Беги дальше. Становись сильнее.</div>
        </div>
        <div className="panel info-chip">
          <Info size={16} className="cyan-text" /> Лучшее снаряжение помогает бежать дальше
        </div>
      </header>
      {highlight && plan.steps.length > 0 && <div className="coach center">Выбери слот со стрелкой и сделай первое улучшение</div>}
      <div className="gear-layout">
        <div className="gear-col">
          {left.map((s) => (
            <SlotCard key={s} slot={s} highlight={highlight} />
          ))}
        </div>
        <div className="gear-center">
          <div className="gear-portal">
            <i />
            <i />
          </div>
          <RunnerView skin={skin} />
          <div className="drag-hint">↻ крути бегуна</div>
        </div>
        <div className="gear-col">
          {right.map((s) => (
            <SlotCard key={s} slot={s} highlight={highlight} />
          ))}
        </div>
      </div>

      <div className="panel stat-strip">
        <div>
          <BoostIcon size={26} />
          <span>
            <small>Скорость</small>
            <b>+{stats.speed}%</b>
          </span>
        </div>
        <div>
          <Target size={26} />
          <span>
            <small>Контроль</small>
            <b>+{stats.control}%</b>
          </span>
        </div>
        <div>
          <Shard size={26} />
          <span>
            <small>Бонус осколков</small>
            <b>+{stats.shardBonus}%</b>
          </span>
        </div>
        <div>
          <StarIcon size={26} />
          <span>
            <small>Комбо бонус</small>
            <b>+{stats.comboBonus}%</b>
          </span>
        </div>
      </div>

      {GEAR_SLOTS.length > 0 && f && (
        <button
          key={f.id}
          className="panel violet skin-banner"
          onClick={() => {
            click();
            openModal({ type: 'skin', skinId: f.id });
          }}
        >
          <div className="skin-banner-text">
            <div className="kicker">{f.rarity === 'legendary' ? 'Легендарный скин' : 'Премиум скин'}</div>
            <div className="h-display skin-banner-title">{f.name}</div>
            <div className="sub">{f.description}</div>
          </div>
          <Img src={`/art/skin-${f.id}.webp`} className="skin-banner-art" />
          <span className="chip violet skin-banner-chip">{p.ownedSkins.includes(f.id) ? 'Открыт' : 'Premium'}</span>
          <span className="btn sm skin-banner-btn">
            Посмотреть <ChevronRight size={14} />
          </span>
        </button>
      )}
      <div className="dots">
        {featured.map((s, i) => (
          <i key={s.id} className={i === slide % featured.length ? 'on' : ''} />
        ))}
      </div>

      <div className="mt">
        <Cta icon={<ChevronsUp size={26} strokeWidth={3} />} disabled={plan.steps.length === 0} onClick={() => openModal({ type: 'upgradeAll' })}>
          Улучшить всё
        </Cta>
        {plan.steps.length === 0 && <div className="sub center mt-s">{GEAR_SLOTS.every((sl) => p.gear[sl] >= cfg.gear[sl].maxLevel) ? 'Всё снаряжение прокачано до максимума' : 'Не хватает ресурсов: беги за кредитами и осколками'}</div>}
      </div>
    </div>
  );
}
