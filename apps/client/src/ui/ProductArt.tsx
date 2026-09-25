import { Img } from './common';
import { Battery, Bolt, Chest, Coin, PassCard, ReviveIcon, StarIcon } from './icons';

/** Product illustrations composed from the icon set and pre-rendered skin art. */
export function ProductArt({ image, size = 84 }: { image: string; size?: number }) {
  const s = size;
  switch (image) {
    case 'stars-s':
      return (
        <div className="pa" style={{ width: s, height: s }}>
          <StarIcon size={s * 0.62} style={{ position: 'absolute', left: '8%', top: '20%' }} />
          <StarIcon size={s * 0.36} style={{ position: 'absolute', right: '6%', bottom: '14%' }} />
        </div>
      );
    case 'stars-m':
      return (
        <div className="pa" style={{ width: s, height: s }}>
          <StarIcon size={s * 0.4} style={{ position: 'absolute', left: '2%', bottom: '18%' }} />
          <StarIcon size={s * 0.6} style={{ position: 'absolute', left: '22%', top: '12%' }} />
          <StarIcon size={s * 0.4} style={{ position: 'absolute', right: '0%', bottom: '14%' }} />
        </div>
      );
    case 'stars-l':
    case 'stars-xl':
      return (
        <div className="pa" style={{ width: s, height: s }}>
          <Chest size={s * 0.78} style={{ position: 'absolute', left: '11%', bottom: '2%' }} />
          <StarIcon size={s * 0.34} style={{ position: 'absolute', left: '14%', top: '8%' }} />
          <StarIcon size={s * 0.42} style={{ position: 'absolute', left: '36%', top: '0%' }} />
          <StarIcon size={s * 0.3} style={{ position: 'absolute', right: '10%', top: '12%' }} />
          {image === 'stars-xl' && (
            <>
              <StarIcon size={s * 0.3} style={{ position: 'absolute', left: '0%', bottom: '4%' }} />
              <StarIcon size={s * 0.32} style={{ position: 'absolute', right: '0%', bottom: '2%' }} />
            </>
          )}
        </div>
      );
    case 'energy':
    case 'energy-xl':
      return (
        <div className="pa battery" style={{ width: s, height: s }}>
          <Battery size={s * 0.92} />
          {image === 'energy-xl' && <Bolt size={s * 0.34} style={{ position: 'absolute', right: 0, top: 0 }} />}
        </div>
      );
    case 'revive':
      return (
        <div className="pa" style={{ width: s, height: s, display: 'grid', placeItems: 'center' }}>
          <ReviveIcon size={s * 0.8} />
        </div>
      );
    case 'credits':
    case 'credits-xl':
      return (
        <div className="pa" style={{ width: s, height: s }}>
          <Coin size={s * 0.5} style={{ position: 'absolute', left: '6%', bottom: '10%' }} />
          <Coin size={s * 0.56} style={{ position: 'absolute', left: '28%', top: '8%' }} />
          <Coin size={s * 0.46} style={{ position: 'absolute', right: '2%', bottom: '6%' }} />
        </div>
      );
    case 'skins':
      return (
        <div className="pa" style={{ width: s, height: s }}>
          <Img src="/art/skin-neon_sprinter.webp" className="pa-skin l" />
          <Img src="/art/skin-void_shadow.webp" className="pa-skin r" />
        </div>
      );
    case 'vip':
      return <Img src="/art/skin-shadow_warden.webp" className="pa-vip" />;
    case 'pass':
      return (
        <div className="pa pass-card" style={{ width: s, height: s }}>
          <PassCard size={s} />
        </div>
      );
    default:
      return <div className="pa" style={{ width: s, height: s }} />;
  }
}
