/** Thin wrapper around Telegram.WebApp so the rest of the app works identically in a normal browser. */

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; photo_url?: string }; start_param?: string };
  version: string;
  platform: string;
  colorScheme: string;
  isExpanded: boolean;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  openInvoice(url: string, cb: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  openTelegramLink(url: string): void;
  onEvent(name: string, cb: () => void): void;
  offEvent(name: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function webApp(): TgWebApp | null {
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

let hapticsEnabled = true;

export const tg = {
  get available(): boolean {
    return webApp() !== null;
  },
  get initData(): string {
    return webApp()?.initData ?? '';
  },
  get startParam(): string | undefined {
    return webApp()?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get('startapp') ?? undefined;
  },

  /** Waits briefly for the async telegram-web-app.js script, then configures the shell. */
  async init(): Promise<void> {
    for (let i = 0; i < 20 && !window.Telegram?.WebApp; i++) await new Promise((r) => setTimeout(r, 50));
    const wa = webApp();
    if (!wa) return;
    try {
      wa.ready();
      wa.expand();
      if (wa.isVersionAtLeast('6.1')) {
        wa.setHeaderColor('#050814');
        wa.setBackgroundColor('#050814');
      }
      wa.setBottomBarColor?.('#050814');
      // A swipe game must not let vertical swipes minimise the app.
      if (wa.isVersionAtLeast('7.7')) wa.disableVerticalSwipes?.();
      const applyInsets = () => {
        const s = wa.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
        const c = wa.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
        const root = document.documentElement.style;
        root.setProperty('--tg-top', `${s.top + c.top}px`);
        root.setProperty('--tg-bottom', `${s.bottom + c.bottom}px`);
      };
      applyInsets();
      wa.onEvent('safeAreaChanged', applyInsets);
      wa.onEvent('contentSafeAreaChanged', applyInsets);
    } catch {
      // Older clients lack some methods; the game still works.
    }
  },

  setBackButton(handler: (() => void) | null) {
    const wa = webApp();
    if (!wa || !wa.isVersionAtLeast('6.1')) return () => undefined;
    if (!handler) {
      wa.BackButton.hide();
      return () => undefined;
    }
    wa.BackButton.show();
    wa.BackButton.onClick(handler);
    return () => wa.BackButton.offClick(handler);
  },

  setClosingConfirmation(on: boolean) {
    const wa = webApp();
    if (!wa || !wa.isVersionAtLeast('6.2')) return;
    if (on) wa.enableClosingConfirmation?.();
    else wa.disableClosingConfirmation?.();
  },

  openInvoice(url: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
    const wa = webApp();
    if (!wa) return Promise.resolve('failed');
    return new Promise((resolve) => wa.openInvoice(url, resolve));
  },

  share(url: string, text: string) {
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const wa = webApp();
    if (wa) wa.openTelegramLink(link);
    else if (navigator.share) navigator.share({ url, text }).catch(() => undefined);
    else window.open(link, '_blank', 'noopener');
  },

  setHaptics(on: boolean) {
    hapticsEnabled = on;
  },

  haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'select') {
    if (!hapticsEnabled) return;
    const h = webApp()?.HapticFeedback;
    try {
      if (h) {
        if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
        else if (kind === 'select') h.selectionChanged();
        else h.impactOccurred(kind);
      } else if ('vibrate' in navigator) {
        navigator.vibrate(kind === 'heavy' || kind === 'error' ? 40 : kind === 'medium' ? 20 : 8);
      }
    } catch {
      // Haptics are best-effort.
    }
  },
};
