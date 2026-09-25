import { useEffect, useRef } from 'react';
import type { SkinDef } from '@void-rush/shared';
import type { RunnerViewer } from '../game/viewer';

export function RunnerView({ skin, className }: { skin: SkinDef; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<RunnerViewer | null>(null);
  useEffect(() => {
    let disposed = false;
    void import('../game/viewer').then(({ RunnerViewer }) => {
      if (disposed || !host.current) return;
      try {
        viewer.current = new RunnerViewer(host.current, skin);
        if (import.meta.env.DEV) (window as unknown as { __viewer: RunnerViewer }).__viewer = viewer.current;
      } catch {
        // WebGL unavailable — the card art around the viewer still renders.
      }
    });
    return () => {
      disposed = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    viewer.current?.setSkin(skin);
  }, [skin]);
  return <div ref={host} className={`runner-view ${className ?? ''}`} />;
}
