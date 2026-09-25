/** Difficulty report: `node packages/shared/scripts/difficulty.ts [runs] [routes]` */
import { DEFAULT_CONFIG } from '../src/config.ts';
import { DEFAULT_GEAR } from '../src/gear.ts';
import type { GearLevels, RouteId } from '../src/types.ts';
import { PLAYERS, playHuman } from '../test/humanBot.ts';

const n = Number(process.argv[2] ?? 30);
const routes = (process.argv[3]?.split(',') ?? ['tutorial', 'neon', 'rift', 'bridge', 'secret', 'event']) as RouteId[];
const MID: GearLevels = { suit: 4, core: 4, boots: 4, shield: 4, magnet: 4, boost: 4 };
for (const route of routes) {
  const row: string[] = [];
  for (const [name, prof] of Object.entries(PLAYERS)) {
    const gear = name === 'casual' ? DEFAULT_GEAR : MID;
    let fin = 0;
    const deaths: number[] = [];
    const scores: number[] = [];
    const grades: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const seed = ((i + 1) * 2246822519) >>> 0;
      const s = playHuman({ config: DEFAULT_CONFIG, routeId: route, seed, gear, revivesAllowed: 0 }, prof, seed ^ 0x5bd1e995);
      if (s.finished) fin++;
      else deaths.push(Math.round(s.durationTicks / 60));
      scores.push(s.score);
      grades[s.grade] = (grades[s.grade] ?? 0) + 1;
    }
    deaths.sort((a, b) => a - b);
    scores.sort((a, b) => a - b);
    const early = deaths.filter((d) => d < 15).length;
    row.push(`${name}: fin ${Math.round((fin / n) * 100)}% | death p50 ${deaths[Math.floor(deaths.length / 2)] ?? '-'}s early(<15s) ${early} | score p50 ${scores[Math.floor(n / 2)]} | ${Object.entries(grades).map(([g, c]) => `${g}:${c}`).join(' ')}`);
  }
  console.log(`\n${route}\n  ${row.join('\n  ')}`);
}
