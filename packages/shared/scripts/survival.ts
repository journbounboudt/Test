/** Wide survivability + score calibration sweep: `npm run survival -- 50` */
import { DEFAULT_CONFIG } from '../src/config.ts';
import { DEFAULT_GEAR } from '../src/gear.ts';
import type { RouteId } from '../src/types.ts';
import { playBot } from '../test/bot.ts';

const n = Number(process.argv[2] ?? 20);
const routes = (process.argv[3]?.split(',') ?? ['neon', 'rift', 'bridge', 'secret', 'event', 'tutorial']) as RouteId[];
for (const route of routes) {
  let deaths = 0;
  const scores: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const seed = (i * 2654435761) >>> 0;
    const { summary } = playBot({ config: DEFAULT_CONFIG, routeId: route, seed, gear: DEFAULT_GEAR, revivesAllowed: 0 });
    if (summary.hardHits > 0) {
      deaths++;
      console.log(`  ${route} seed ${seed}: died at ${summary.distance} m`);
    }
    scores.push(summary.score);
  }
  scores.sort((a, b) => a - b);
  console.log(`${route}: ${n - deaths}/${n} survived; score p10=${scores[Math.floor(n * 0.1)]} p50=${scores[Math.floor(n / 2)]} max=${scores[n - 1]} (${((Date.now() - t0) / n).toFixed(0)} ms/run)`);
}
