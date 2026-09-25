import { Flag, Hand, Pause, Play, RotateCcw, LogOut, Skull, Timer, Volume2, VolumeX, Music } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { skinById, type BoostId, type InputRecord, type RunSummary } from '@void-rush/shared';
import { ApiError } from '../api/client';
import { audio } from '../audio/audio';
import type { EngineEvent, GameEngine, HudState } from '../game/engine';
import { tg } from '../platform/telegram';
import { buyRevive, saveSettings, startRun, submitRun } from '../state/actions';
import { useStore } from '../state/store';
import { Btn, Logo, click } from '../ui/common';
import { BoostIcon, CurrencyIcon, MagnetIcon, ReviveIcon, Shard, ShieldIcon, StarIcon } from '../ui/icons';
import { clock, fmt } from '../ui/format';

type Overlay = null | 'checkpoint' | 'down' | 'pause' | 'submitting' | 'error' | 'loading';
interface Popup {
  id: number;
  text: string;
  kind: string;
}

const HINTS: Record<string, string> = {
  swipe: 'Свайпни влево или вправо, чтобы сменить полосу',
  shards: 'Собирай осколки — они дают очки и комбо',
  charge: 'Голубые заряды наполняют ПРОРЫВ ВОЙДА — жми большую кнопку!',
  gadget: 'Впереди ворота — нажми ЩИТ, чтобы пройти сквозь удар',
};

const BOOST_ICON: Record<BoostId, (p: { size?: number }) => React.ReactElement> = {
  speed: BoostIcon,
  magnet: MagnetIcon,
  shield: ShieldIcon,
  combo: (p) => <CurrencyIcon kind="xp" size={p.size} />,
  luck: StarIcon,
  breakthrough: (p) => <CurrencyIcon kind="module" size={p.size} />,
};
const BOOST_TONE: Record<BoostId, string> = { speed: 'gold', magnet: 'violet', shield: 'cyan', combo: 'cyan', luck: 'gold', breakthrough: 'violet' };

let popupId = 1;

export function RunScreen() {
  const run = useStore((s) => s.activeRun);
  const config = useStore((s) => s.config)!;
  const profile = useStore((s) => s.profile)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('loading');
  const [count, setCount] = useState<number | null>(null);
  const [options, setOptions] = useState<BoostId[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: string; id: number } | null>(null);
  const [bossName, setBossName] = useState<string | null>(null);
  const [reviveLeft, setReviveLeft] = useState(0);
  const [reviveBusy, setReviveBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pendingFinish = useRef<{ summary: RunSummary; inputs: InputRecord[] } | null>(null);
  const after = useRef<'results' | 'home' | 'restart'>('results');
  const route = run ? config.routes[run.routeId] : null;

  const addPopup = useCallback((text: string, kind: string) => {
    const id = popupId++;
    setPopups((p) => [...p.slice(-3), { id, text, kind }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 900);
  }, []);

  const finish = useCallback(async () => {
    const data = pendingFinish.current;
    const st = useStore.getState();
    const r = st.activeRun;
    if (!data || !r) return;
    setOverlay('submitting');
    try {
      const result = await submitRun({ runId: r.ticket.runId, token: r.ticket.token, inputs: data.inputs as [number, string][], summary: data.summary });
      if (after.current === 'restart') {
        useStore.setState({ activeRun: null });
        useStore.getState().navigate('routes', { replace: true });
        void startRun(r.routeId);
        return;
      }
      useStore.setState({ lastResult: result, activeRun: null });
      if (after.current === 'home') useStore.getState().navigate('home');
      else useStore.getState().navigate('results', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Не удалось отправить результат');
      setOverlay('error');
    }
  }, []);

  const onEvent = useCallback(
    (e: EngineEvent) => {
      switch (e.type) {
        case 'countdown':
          setCount(e.n);
          if (e.n === 0) setTimeout(() => setCount(null), 600);
          break;
        case 'checkpoint':
          setOptions(e.options);
          setOverlay('checkpoint');
          break;
        case 'down':
          setOverlay('down');
          setReviveLeft(6);
          break;
        case 'done':
          pendingFinish.current = { summary: e.summary, inputs: e.inputs };
          void finish();
          break;
        case 'popup':
          addPopup(e.text, e.kind);
          break;
        case 'hint':
          setHint(HINTS[e.hint] ?? null);
          setTimeout(() => setHint(null), 3200);
          break;
        case 'flash':
          setFlash({ kind: e.kind, id: popupId++ });
          break;
        case 'climax':
          setBossName(e.name);
          setTimeout(() => setBossName(null), 2600);
          break;
        case 'autopause':
          engineRef.current?.pause();
          setOverlay('pause');
          break;
      }
    },
    [addPopup, finish],
  );

  useEffect(() => {
    if (!run || !hostRef.current) return;
    let disposed = false;
    const skin = skinById(config, profile.selectedSkin) ?? config.skins[0];
    const load = Promise.all([import('../game/engine'), import('../game/preload').then((m) => m.preloadCore()).catch(() => undefined)]);
    void load.then(([{ GameEngine }]) => {
      if (disposed || !hostRef.current) return;
      try {
        const engine = new GameEngine(hostRef.current, {
          config,
          routeId: run.routeId,
          seed: run.ticket.seed,
          gear: run.ticket.gear,
          skin,
          graphics: profile.settings.graphics,
          reducedShake: profile.settings.reducedShake,
          reducedFlash: profile.settings.reducedFlash,
          onHud: setHud,
          onEvent,
        });
        engineRef.current = engine;
        if (import.meta.env.DEV) (window as unknown as { __engine: GameEngine }).__engine = engine;
        setOverlay(null);
        engine.start();
        if (run.routeId === 'tutorial') setTimeout(() => setHint(HINTS.swipe), 3300);
      } catch (err) {
        console.error(err);
        setErrorMsg('Ваше устройство не поддерживает 3D-графику (WebGL)');
        setOverlay('error');
      }
    });
    tg.setClosingConfirmation(true);
    const offBack = tg.setBackButton(() => {
      engineRef.current?.pause();
      setOverlay((o) => (o === null ? 'pause' : o));
    });
    return () => {
      disposed = true;
      offBack();
      tg.setClosingConfirmation(false);
      engineRef.current?.dispose();
      engineRef.current = null;
      audio.play('menu');
    };
    // Engine lifetime is bound to the run ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.ticket.runId]);

  // Revive countdown
  useEffect(() => {
    if (overlay !== 'down' || reviveBusy) return;
    if (reviveLeft <= 0) {
      engineRef.current?.queue('end');
      return;
    }
    const t = setTimeout(() => setReviveLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [overlay, reviveLeft, reviveBusy]);

  // Checkpoint auto-pick keeps the run flowing if the player hesitates.
  useEffect(() => {
    if (overlay !== 'checkpoint' || options.length === 0) return;
    const t = setTimeout(() => pickBoost(options[0]), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, options]);

  if (!run || !route) return null;

  const engine = () => engineRef.current;
  const press = (a: 'shield' | 'magnet' | 'ult') => (e: React.PointerEvent) => {
    e.stopPropagation();
    audio.unlock();
    engine()?.queue(a);
  };
  function pickBoost(id: BoostId) {
    click();
    engine()?.queue(`boost:${id}`);
    setOverlay(null);
    setOptions([]);
  }
  const pause = () => {
    click();
    engine()?.pause();
    setOverlay('pause');
  };
  const resume = () => {
    click();
    setOverlay(null);
    engine()?.resume();
  };
  const quit = (mode: 'home' | 'restart') => {
    click();
    after.current = mode;
    setOverlay('submitting');
    const e = engine();
    e?.resume();
    e?.queue('end');
  };
  const revive = async (method: 'token' | 'stars') => {
    setReviveBusy(true);
    const ok = await buyRevive(run.ticket.runId, method);
    setReviveBusy(false);
    if (ok) {
      engine()?.queue('revive');
      setOverlay(null);
    }
  };
  const declineRevive = () => {
    click();
    engine()?.queue('end');
  };

  const best = profile.stats.routeBest[run.routeId]?.distance ?? profile.stats.bestDistance;
  // Controls reminder only for the first couple of real runs; veterans never see it.
  const showControlsHint = run.routeId !== 'tutorial' && profile.stats.runs < 2;
  const ultPct = hud ? (hud.ultActive > 0 ? hud.ultActive : hud.ult) : 0;
  const canRevive = !hud || true;
  const hasToken = profile.balances.reviveTokens >= config.revive.tokenCost;
  const hasStars = profile.balances.stars >= config.revive.starsCost;

  return (
    <div className="run-root" ref={hostRef}>
      <div className="hud">
        <div className="run-progress" aria-hidden>
          <i className="fill" style={{ width: `${(hud?.progress ?? 0) * 100}%` }} />
          {hud?.checkpoints.map((c) => <b key={c} className={`cp ${(hud?.progress ?? 0) >= c ? 'done' : ''}`} style={{ left: `${c * 100}%` }} />)}
          {hud?.climax != null && <span className="boss-zone" style={{ left: `${hud.climax * 100}%` }}><Skull size={10} /></span>}
          <span className="finish-flag"><Flag size={11} /></span>
        </div>
        <div className="hud-top">
          <div className="hud-left">
            <div className="row" style={{ gap: 8 }}>
              <button className="hud-pause" onPointerDown={(e) => e.stopPropagation()} onClick={pause} aria-label="Пауза">
                <Pause size={22} fill="currentColor" />
              </button>
              <Logo size={24} />
            </div>
            <div className="hud-panel">
              <div className="hud-label">Расстояние</div>
              <div className="hud-big num">{fmt(hud?.distance ?? 0)} м</div>
              {best > 0 && <div className="hud-small">Лучший: {fmt(best)} м</div>}
              <div className="hud-label" style={{ marginTop: 6 }}>
                Счёт
              </div>
              <div className="hud-big num row" style={{ gap: 6 }}>
                {fmt(hud?.score ?? 0)} <Shard size={20} />
              </div>
            </div>
          </div>
          <div className="hud-right">
            <div className="hud-panel hud-time">
              <Timer size={26} className="timer-ico" />
              <div>
                <div className="hud-label">Время</div>
                <div className={`hud-big num ${hud && hud.time <= 10 ? 'hot' : ''}`}>{clock(hud?.time ?? route.durationSec)}</div>
              </div>
            </div>
            <div className={`hud-combo m${hud?.mult ?? 1} ${hud && hud.mult > 1 ? 'on' : ''}`} key={`m${hud?.mult ?? 1}`}>
              <div className="hud-label gold-text">Комбо</div>
              <div className="combo-val num">x{hud?.combo ?? 0}</div>
              <div className="combo-gain num">{hud && hud.gain > 0 ? <>+{fmt(hud.gain)} <Shard size={13} /></> : <>множитель x{hud?.mult ?? 1}</>}</div>
            </div>
            {(hud?.boostShields ?? 0) > 0 && (
              <div className="hud-chip">
                <ShieldIcon size={14} /> щит ×{hud?.boostShields}
              </div>
            )}
            {hud?.speedBoost && (
              <div className="hud-chip gold">
                <BoostIcon size={14} /> скорость
              </div>
            )}
            {hud?.pad && <div className="hud-chip cyan">⟫ рывок</div>}
          </div>
        </div>

        <div className="popups">
          {popups.map((p) => (
            <div key={p.id} className={`popup ${p.kind}`}>
              {p.text}
            </div>
          ))}
        </div>

        {count !== null && <div className="countdown" key={count}>{count === 0 ? 'GO!' : count}</div>}
        {bossName && (
          <div className="boss-banner">
            <span className="boss-kicker">⚠ Мини-босс</span>
            <b>{bossName}</b>
            <span className="boss-sub">Уворачивайся от обломков!</span>
          </div>
        )}
        {hud?.climaxActive && !bossName && <div className="boss-edge" />}

        <div className="hud-bottom">
          {(hint || (hud?.phase === 'countdown' && showControlsHint)) && (
            <div className="swipe-hint">
              <span>‹</span>
              <Hand size={18} className="hint-hand" />
              {hint ?? 'Свайп для уклонения'}
              <span>›</span>
            </div>
          )}
          <div className="gadgets">
            <button className={`gadget shield ${hud && hud.shieldActive > 0 ? 'active' : ''}`} disabled={!hud || (hud.shieldCharges <= 0 && hud.shieldActive <= 0)} onPointerDown={press('shield')}>
              <div className="hex">
                <ShieldIcon size={34} />
                <span className="count">{hud?.shieldCharges ?? 0}</span>
                {hud && hud.shieldActive > 0 && <i className="ring" style={{ ['--p' as string]: hud.shieldActive }} />}
              </div>
              <b>Щит</b>
              <span>Защищает 1 удар</span>
            </button>
            <button className={`gadget ult ${hud && hud.ult >= 1 ? 'ready' : ''} ${hud && hud.ultActive > 0 ? 'active' : ''}`} disabled={!hud || (hud.ult < 1 && hud.ultActive <= 0)} onPointerDown={press('ult')}>
              <div className="hex big">
                <BoostIcon size={46} />
                {hud && hud.ultActive > 0 && <i className="ring" style={{ ['--p' as string]: hud.ultActive }} />}
              </div>
              <b>Ускорение</b>
              <span>Прорыв войда</span>
              <div className="ult-bar">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className={ultPct * 5 > i ? 'on' : ''} />
                ))}
              </div>
            </button>
            <button className={`gadget magnet ${hud && hud.magnetActive > 0 ? 'active' : ''}`} disabled={!hud || (hud.magnetCharges <= 0 && hud.magnetActive <= 0)} onPointerDown={press('magnet')}>
              <div className="hex">
                <MagnetIcon size={34} />
                <span className="count">{hud?.magnetCharges ?? 0}</span>
                {hud && hud.magnetActive > 0 && <i className="ring" style={{ ['--p' as string]: hud.magnetActive }} />}
              </div>
              <b>Магнит</b>
              <span>Притягивает осколки</span>
            </button>
          </div>
        </div>
      </div>

      {flash && <div key={flash.id} className={`flash-layer ${flash.kind}`} />}

      {overlay === 'loading' && (
        <div className="run-overlay">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <div className="sub mt">Открываем портал…</div>
        </div>
      )}

      {overlay === 'checkpoint' && (
        <div className="run-overlay checkpoint" onPointerDown={(e) => e.stopPropagation()}>
          <div className="kicker">Чекпоинт</div>
          <h2 className="h-display" style={{ fontSize: 28 }}>
            Выбери буст
          </h2>
          {run.routeId === 'tutorial' && <div className="sub center">Бусты действуют только в этом забеге</div>}
          <div className="boost-cards">
            {options.map((id) => {
              const Icon = BOOST_ICON[id];
              return (
                <button key={id} className={`boost-card ${BOOST_TONE[id]}`} onClick={() => pickBoost(id)}>
                  <Icon size={40} />
                  <b>{config.boosts[id].name}</b>
                  <span>{config.boosts[id].description}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {overlay === 'down' && (
        <div className="run-overlay down" onPointerDown={(e) => e.stopPropagation()}>
          <h2 className="h-display red" style={{ fontSize: 30 }}>
            Столкновение!
          </h2>
          <div className="revive-timer">{reviveLeft}</div>
          {canRevive && (
            <div className="col" style={{ width: '100%', maxWidth: 320 }}>
              <Btn variant="violet" block loading={reviveBusy} disabled={!hasToken} onClick={() => void revive('token')}>
                <ReviveIcon size={20} /> Возродиться · {config.revive.tokenCost} жетон (есть {profile.balances.reviveTokens})
              </Btn>
              <Btn variant="gold" block loading={reviveBusy} disabled={!hasStars} onClick={() => void revive('stars')}>
                <StarIcon size={18} /> Возродиться за {config.revive.starsCost}
              </Btn>
              <Btn variant="ghost" block onClick={declineRevive}>
                Завершить забег
              </Btn>
              <div className="sub center">Одно возрождение за забег · 2.5 с неуязвимости</div>
            </div>
          )}
        </div>
      )}

      {overlay === 'pause' && (
        <div className="run-overlay" onPointerDown={(e) => e.stopPropagation()}>
          <h2 className="h-display" style={{ fontSize: 34 }}>
            Пауза
          </h2>
          <div className="col" style={{ width: '100%', maxWidth: 300, marginTop: 16 }}>
            <Btn variant="cyan" block onClick={resume}>
              <Play size={18} fill="currentColor" /> Продолжить
            </Btn>
            {route.energyCost > 0 && run.routeId !== 'tutorial' && (
              <Btn block onClick={() => quit('restart')}>
                <RotateCcw size={18} /> Перезапустить · {route.energyCost} энергии
              </Btn>
            )}
            <Btn variant="ghost" block onClick={() => quit('home')}>
              <LogOut size={18} /> Выйти
            </Btn>
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 8 }}>
              <Btn size="sm" variant="ghost" onClick={() => void saveSettings({ music: !profile.settings.music })}>
                <Music size={16} /> {profile.settings.music ? 'Музыка вкл' : 'Музыка выкл'}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => void saveSettings({ sfx: !profile.settings.sfx })}>
                {profile.settings.sfx ? <Volume2 size={16} /> : <VolumeX size={16} />} {profile.settings.sfx ? 'Звуки вкл' : 'Звуки выкл'}
              </Btn>
            </div>
            <div className="sub center">Таймер забега остановлен</div>
          </div>
        </div>
      )}

      {overlay === 'submitting' && (
        <div className="run-overlay">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <div className="sub mt">Сервер проверяет забег…</div>
        </div>
      )}

      {overlay === 'error' && (
        <div className="run-overlay" onPointerDown={(e) => e.stopPropagation()}>
          <h2 className="h-display" style={{ fontSize: 24 }}>
            Нет связи
          </h2>
          <div className="sub center" style={{ maxWidth: 280 }}>
            {errorMsg}. Результат сохранён на устройстве.
          </div>
          <div className="col" style={{ width: '100%', maxWidth: 280, marginTop: 14 }}>
            {pendingFinish.current && (
              <Btn variant="cyan" block onClick={() => void finish()}>
                Повторить
              </Btn>
            )}
            <Btn
              variant="ghost"
              block
              onClick={() => {
                useStore.setState({ activeRun: null });
                useStore.getState().navigate('home');
              }}
            >
              На главную
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
