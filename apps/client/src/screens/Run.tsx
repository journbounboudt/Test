import { Hand, Pause, Play, RotateCcw, LogOut, Timer, Volume2, VolumeX, Music, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { skinById, type BoostId, type InputRecord, type RunSummary } from '@void-rush/shared';
import { ApiError } from '../api/client';
import { audio } from '../audio/audio';
import type { EngineEvent, GameEngine, HudState } from '../game/engine';
import { tg } from '../platform/telegram';
import { buyRevive, saveSettings, startRun, submitRun } from '../state/actions';
import { useStore } from '../state/store';
import { Btn, click } from '../ui/common';
import { BoostIcon, CurrencyIcon, MagnetIcon, ReviveIcon, ShieldIcon, StarIcon, Target } from '../ui/icons';
import { clock, fmt } from '../ui/format';

type Overlay = null | 'checkpoint' | 'down' | 'pause' | 'submitting' | 'error' | 'loading';
interface Popup {
  id: number;
  text: string;
  kind: string;
}

const HINTS: Record<string, string> = {
  swipe: 'Свайп — сменить полосу',
  shards: 'Собирай осколки',
  charge: 'Заряды копят Прорыв — жми центр',
  gadget: 'Жми Щит — пройдёшь сквозь ворота',
};

const BOOST_ICON: Record<BoostId, (p: { size?: number }) => React.ReactElement> = {
  speed: BoostIcon,
  magnet: MagnetIcon,
  shield: ShieldIcon,
  combo: Target,
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

  const [nearMiss, setNearMiss] = useState(0);
  const recordShown = useRef(false);
  const addPopup = useCallback((text: string, kind: string) => {
    if (kind === 'near') {
      setNearMiss(popupId++);
      return;
    }
    const id = popupId++;
    setPopups([{ id, text, kind }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1100);
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

  // One-time "new record" callout when the live score passes the route best.
  useEffect(() => {
    if (!hud || !run || recordShown.current) return;
    const best = profile.stats.routeBest[run.routeId]?.score ?? 0;
    if (best > 0 && hud.score > best) {
      recordShown.current = true;
      addPopup('Новый рекорд!', 'record');
    }
  }, [hud, run, profile.stats.routeBest, addPopup]);

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

  // Labels and control hints only while the player is still learning; veterans get a clean screen.
  const learning = run.routeId === 'tutorial' || profile.stats.runs < 2;
  const hasToken = profile.balances.reviveTokens >= config.revive.tokenCost;
  const hasStars = profile.balances.stars >= config.revive.starsCost;
  const reviveMethod: 'token' | 'stars' = hasToken ? 'token' : 'stars';
  const step = config.sim.comboStep;
  const mult = hud?.mult ?? 1;
  const multProgress = mult >= config.sim.comboMultCap ? 1 : ((hud?.combo ?? 0) % step) / step;
  const ultFill = hud ? (hud.ultActive > 0 ? hud.ultActive : hud.ult) : 0;
  const timeLeft = hud?.time ?? route.durationSec;

  return (
    <div className="run-root" ref={hostRef}>
      <div className="hud">
        <header className="hud-head">
          <div className="hud-row">
            <button className="hud-pause" onPointerDown={(e) => e.stopPropagation()} onClick={pause} aria-label="Пауза">
              <Pause size={20} fill="currentColor" />
            </button>
            <div className="hud-score">
              <b className="num">{fmt(hud?.score ?? 0)}</b>
              <span className="num">{fmt(hud?.distance ?? 0)} м</span>
            </div>
            <div className={`hud-timer ${timeLeft <= 10 && hud?.phase === 'run' ? 'hot' : ''}`}>
              <Timer size={16} />
              <b className="num">{clock(timeLeft)}</b>
            </div>
          </div>
          <div className="run-progress" aria-hidden>
            <i className="fill" style={{ width: `${(hud?.progress ?? 0) * 100}%` }} />
            {hud?.checkpoints.map((c) => <b key={c} className={`cp ${(hud?.progress ?? 0) >= c ? 'done' : ''}`} style={{ left: `${c * 100}%` }} />)}
            {hud?.climax != null && <span className="boss-zone" style={{ left: `${hud.climax * 100}%` }} />}
          </div>
          <div className="hud-sub">
            <div className="hud-status">
              {(hud?.boostShields ?? 0) > 0 && (
                <span className="status-ico cyan" title="Щит из буста">
                  <ShieldIcon size={15} />
                </span>
              )}
              {hud?.speedBoost && (
                <span className="status-ico gold" title="Скорость">
                  <BoostIcon size={15} />
                </span>
              )}
            </div>
            {(hud?.combo ?? 0) > 0 && (
              <div className={`hud-mult m${mult}`} key={`m${mult}`}>
                <b className="num">×{mult}</b>
                <div className="mult-meta">
                  <span className="num">{hud?.combo}</span>
                  <i style={{ ['--p' as string]: multProgress }} />
                </div>
              </div>
            )}
          </div>
        </header>

        {popups.length > 0 && (
          <div className="callout-slot">
            {popups.slice(-1).map((p) => (
              <div key={p.id} className={`callout ${p.kind}`}>
                {p.text}
              </div>
            ))}
          </div>
        )}
        {nearMiss > 0 && (
          <div className="near-slot" key={nearMiss}>
            впритык
          </div>
        )}

        {count !== null && <div className="countdown" key={count}>{count === 0 ? 'GO!' : count}</div>}
        {bossName && (
          <div className="boss-banner">
            <span className="boss-kicker">Мини-босс</span>
            <b>{bossName}</b>
          </div>
        )}
        {hud?.climaxActive && !bossName && <div className="boss-edge" />}

        <footer className="hud-foot">
          {(hint || (hud?.phase === 'countdown' && learning)) && (
            <div className="swipe-hint">
              <Hand size={16} className="hint-hand" />
              {hint ?? 'Свайпай влево и вправо'}
            </div>
          )}
          <div className={`gadgets ${learning ? 'labeled' : ''}`}>
            <button className={`gadget shield ${hud && hud.shieldActive > 0 ? 'active' : ''}`} disabled={!hud || (hud.shieldCharges <= 0 && hud.shieldActive <= 0)} onPointerDown={press('shield')} aria-label="Щит">
              <div className="hex">
                <ShieldIcon size={28} />
                {hud && hud.shieldActive > 0 && <i className="ring" style={{ ['--p' as string]: hud.shieldActive }} />}
              </div>
              <span className="count num">{hud?.shieldCharges ?? 0}</span>
              {learning && <em>Щит</em>}
            </button>
            <button
              className={`gadget ult ${hud && hud.ult >= 1 ? 'ready' : ''} ${hud && hud.ultActive > 0 ? 'active' : ''}`}
              disabled={!hud || (hud.ult < 1 && hud.ultActive <= 0)}
              onPointerDown={press('ult')}
              aria-label="Прорыв"
              style={{ ['--c' as string]: ultFill }}
            >
              <div className="hex big">
                <i className="charge" />
                <BoostIcon size={40} />
              </div>
              {learning && <em>Прорыв</em>}
            </button>
            <button className={`gadget magnet ${hud && hud.magnetActive > 0 ? 'active' : ''}`} disabled={!hud || (hud.magnetCharges <= 0 && hud.magnetActive <= 0)} onPointerDown={press('magnet')} aria-label="Магнит">
              <div className="hex">
                <MagnetIcon size={28} />
                {hud && hud.magnetActive > 0 && <i className="ring" style={{ ['--p' as string]: hud.magnetActive }} />}
              </div>
              <span className="count num">{hud?.magnetCharges ?? 0}</span>
              {learning && <em>Магнит</em>}
            </button>
          </div>
        </footer>
      </div>

      {flash && <div key={flash.id} className={`flash-layer ${flash.kind}`} />}

      {overlay === 'loading' && (
        <div className="run-overlay">
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      )}

      {overlay === 'checkpoint' && (
        <div className="run-overlay checkpoint" onPointerDown={(e) => e.stopPropagation()}>
          <h2 className="h-display" style={{ fontSize: 26 }}>
            Выбери буст
          </h2>
          <div className="cp-timer">
            <i />
          </div>
          <div className="boost-cards">
            {options.map((id) => {
              const Icon = BOOST_ICON[id];
              return (
                <button key={id} className={`boost-card ${BOOST_TONE[id]}`} onClick={() => pickBoost(id)}>
                  <Icon size={44} />
                  <b>{config.boosts[id].name}</b>
                  <span>{config.boosts[id].short ?? ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {overlay === 'down' && (
        <div className="run-overlay down" onPointerDown={(e) => e.stopPropagation()}>
          <div className="revive-timer" style={{ ['--p' as string]: reviveLeft / 6 }}>
            <span>{reviveLeft}</span>
          </div>
          <h2 className="h-display red" style={{ fontSize: 28 }}>
            Продолжить?
          </h2>
          <div className="col" style={{ width: '100%', maxWidth: 280, marginTop: 8 }}>
            <Btn variant={reviveMethod === 'token' ? 'violet' : 'gold'} block loading={reviveBusy} disabled={!hasToken && !hasStars} onClick={() => void revive(reviveMethod)}>
              Возродиться
              <span className="cost-chip">
                {reviveMethod === 'token' ? <ReviveIcon size={16} /> : <StarIcon size={15} />}
                {reviveMethod === 'token' ? config.revive.tokenCost : config.revive.starsCost}
              </span>
            </Btn>
            <Btn variant="ghost" block onClick={declineRevive}>
              Завершить
            </Btn>
          </div>
        </div>
      )}

      {overlay === 'pause' && (
        <div className="run-overlay" onPointerDown={(e) => e.stopPropagation()}>
          <h2 className="h-display" style={{ fontSize: 34 }}>
            Пауза
          </h2>
          <div className="col" style={{ width: '100%', maxWidth: 280, marginTop: 16 }}>
            <Btn variant="cyan" block onClick={resume}>
              <Play size={18} fill="currentColor" /> Продолжить
            </Btn>
            {route.energyCost > 0 && run.routeId !== 'tutorial' && (
              <Btn block onClick={() => quit('restart')}>
                <RotateCcw size={18} /> Заново
                <span className="cost-chip">
                  <Zap size={14} fill="currentColor" />
                  {route.energyCost}
                </span>
              </Btn>
            )}
            <Btn variant="ghost" block onClick={() => quit('home')}>
              <LogOut size={18} /> Выйти
            </Btn>
            <div className="row pause-toggles">
              <button className={`icon-btn ${profile.settings.music ? '' : 'off'}`} onClick={() => void saveSettings({ music: !profile.settings.music })} aria-label="Музыка">
                <Music size={18} />
              </button>
              <button className={`icon-btn ${profile.settings.sfx ? '' : 'off'}`} onClick={() => void saveSettings({ sfx: !profile.settings.sfx })} aria-label="Звуки">
                {profile.settings.sfx ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
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
