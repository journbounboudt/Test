import { Rng, currentEvent, hashString, weekKey } from '@void-rush/shared';
import type { Game } from './game.ts';

const NAMES: [string, string][] = [
  ['DarkNova', 'void_shadow'], ['StellarRun', 'neon_sprinter'], ['VoidHunter', 'void_guard'], ['NebulaKid', 'void_echo'], ['CosmoFox', 'neon_sprinter'],
  ['Quasar', 'void_guard'], ['NightPulse', 'void_shadow'], ['ZeroG', 'void_guard'], ['Orbita', 'neon_sprinter'], ['Хронос', 'void_guard'],
  ['Комета', 'void_echo'], ['Ирбис', 'void_guard'], ['Сириус', 'void_shadow'], ['NeonWolf', 'neon_sprinter'], ['Вихрь', 'void_guard'],
  ['AstraLine', 'void_guard'], ['Пульсар', 'void_echo'], ['RiftRider', 'void_shadow'], ['Luma', 'neon_sprinter'], ['Гравитон', 'void_guard'],
  ['EchoStep', 'void_guard'], ['Тень', 'void_shadow'], ['Photon', 'neon_sprinter'], ['Магнетар', 'void_guard'], ['Vanta', 'void_shadow'],
  ['Альтаир', 'void_guard'], ['Drift', 'neon_sprinter'], ['Нова', 'void_echo'], ['Kairo', 'void_guard'], ['Скиф', 'void_guard'],
];

/**
 * Development-only rivals so the leaderboard and community event have context on a fresh database.
 * Enabled by SEED_DEMO (defaults on outside production). Rivals are regular rows flagged `is_bot`.
 */
export function seedDemo(game: Game) {
  const db = game.db;
  const now = game.now();
  const wk = weekKey(now);
  db.tx(() => {
    NAMES.forEach(([name, skin], i) => {
      const id = `p_demo_${i}`;
      if (!game.players.find(id)) {
        const p = game.players.create({ id, platform: 'demo', platformUserId: `demo_${i}`, displayName: name, isBot: true }, game.config, now);
        p.level = 4 + ((i * 7) % 28);
        p.selectedSkin = skin;
        p.ownedSkins = [skin];
        game.players.save(p, now);
        db.run('UPDATE players SET is_bot = 1 WHERE id = ?', id);
      }
    });
    const has = db.get('SELECT 1 FROM leaderboard WHERE week_key = ? AND player_id LIKE ?', wk, 'p_demo_%');
    if (!has) {
      const rng = new Rng(hashString(wk));
      NAMES.forEach((_, i) => {
        const score = Math.floor(50000 * Math.pow(0.93, i) * (0.9 + rng.next() * 0.2));
        db.run('INSERT OR IGNORE INTO leaderboard (week_key, player_id, best_score, distance, run_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)', wk, `p_demo_${i}`, score, Math.floor(score / 11), `demo_${wk}_${i}`, now - i * 60000);
      });
    }
    const ev = currentEvent(game.config, now);
    const hasEvent = db.get('SELECT 1 FROM event_totals WHERE instance_id = ?', ev.instanceId);
    if (!hasEvent && ev.active) {
      const rng = new Rng(hashString(ev.instanceId));
      let total = 0;
      NAMES.forEach((_, i) => {
        const dmg = Math.floor(40000 + rng.next() * 90000) * (1 + (i % 3));
        total += dmg;
        db.run('INSERT OR IGNORE INTO event_players (instance_id, player_id, damage, best, runs, last_day, day_runs, last_damage, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)', ev.instanceId, `p_demo_${i}`, dmg, Math.floor(dmg / 3), 3, Math.floor(dmg / 3), now - i * 90000);
      });
      db.run('INSERT OR IGNORE INTO event_totals (instance_id, damage, participants) VALUES (?, ?, ?)', ev.instanceId, total, NAMES.length);
    }
  });
}
