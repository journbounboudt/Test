import { Component, useEffect, type ReactNode } from 'react';
import { audio } from './audio/audio';
import { ModalHost } from './modals/Modals';
import { tg } from './platform/telegram';
import { EventLobby } from './screens/Event';
import { Gear } from './screens/Gear';
import { Home } from './screens/Home';
import { HowToPlay } from './screens/HowToPlay';
import { Leaderboard } from './screens/Leaderboard';
import { Pass } from './screens/Pass';
import { Results } from './screens/Results';
import { RunScreen } from './screens/Run';
import { RunSelect } from './screens/RunSelect';
import { Shop } from './screens/Shop';
import { boot, refreshProfile } from './state/actions';
import { useStore } from './state/store';
import { BottomNav, Btn, Logo } from './ui/common';
import { SvgDefs } from './ui/icons';
import { track } from './analytics';

function BootScreen() {
  const state = useStore((s) => s.boot);
  const msg = useStore((s) => s.bootMessage);
  const progress = useStore((s) => s.bootProgress);
  return (
    <div className="boot">
      <div className="boot-portal" />
      <Logo size={56} />
      {state === 'loading' && (
        <>
          <div className="boot-bar">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="sub">{msg}</div>
        </>
      )}
      {state === 'error' && (
        <div className="panel boot-card">
          <b>Нет связи с пустотой</b>
          <div className="sub">{msg}</div>
          <Btn variant="cyan" onClick={() => void boot()}>
            Повторить
          </Btn>
        </div>
      )}
      {state === 'maintenance' && (
        <div className="panel boot-card">
          <b>Технические работы</b>
          <div className="sub">Мы улучшаем порталы. Загляните чуть позже — прогресс в безопасности.</div>
          <Btn variant="cyan" onClick={() => void boot()}>
            Проверить снова
          </Btn>
        </div>
      )}
      {state === 'outdated' && (
        <div className="panel boot-card">
          <b>Доступно обновление</b>
          <div className="sub">Эта версия игры устарела. Перезагрузите, чтобы продолжить.</div>
          <Btn variant="gold" onClick={() => location.reload()}>
            Обновить
          </Btn>
        </div>
      )}
      <div className="boot-foot side-note">60 секунд. Один забег. Большой лут.</div>
    </div>
  );
}

/** Last-resort guard: a render error shows a friendly recovery card instead of a blank screen. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[void-rush] render error', err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot">
        <Logo size={44} />
        <div className="panel boot-card">
          <b>Что-то пошло не так</b>
          <div className="sub">Прогресс сохранён на сервере. Перезапустите экран.</div>
          <Btn
            variant="cyan"
            onClick={() => {
              this.setState({ failed: false });
              useStore.getState().navigate('home', { replace: true });
            }}
          >
            На главную
          </Btn>
        </div>
      </div>
    );
  }
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const bootState = useStore((s) => s.boot);
  const screen = useStore((s) => s.screen);
  const history = useStore((s) => s.history);
  const back = useStore((s) => s.back);

  useEffect(() => {
    void boot();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    const onVisible = () => {
      if (!document.hidden && useStore.getState().boot === 'ready' && useStore.getState().screen !== 'run') void refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (bootState !== 'ready') return;
    if (screen !== 'run') audio.play('menu');
    if (screen === 'home') track('home_view');
    if (screen === 'run') return;
    const off = tg.setBackButton(history.length > 0 ? () => back() : null);
    return off;
  }, [bootState, screen, history.length, back]);

  if (bootState !== 'ready') {
    return (
      <div className="app">
        <SvgDefs />
        <BootScreen />
      </div>
    );
  }

  const inRun = screen === 'run';
  return (
    <div className={`app ${inRun ? 'in-run' : ''}`}>
      <SvgDefs />
      <div className="stars-bg" />
      <ErrorBoundary>
      {screen === 'home' && <Home />}
      {screen === 'routes' && <RunSelect />}
      {screen === 'howto' && <HowToPlay />}
      {screen === 'run' && <RunScreen />}
      {screen === 'results' && <Results />}
      {screen === 'gear' && <Gear />}
      {screen === 'shop' && <Shop />}
      {screen === 'pass' && <Pass />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'event' && <EventLobby />}
      </ErrorBoundary>
      {!inRun && <BottomNav />}
      <ModalHost />
      <Toasts />
    </div>
  );
}
