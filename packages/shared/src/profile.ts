/** Integrates a piecewise-linear speed curve so time↔distance lookups are cheap and deterministic. */
export class SpeedProfile {
  readonly curve: [number, number][];
  readonly step = 0.05;
  readonly dist: number[];

  constructor(curve: [number, number][], horizonSec: number) {
    this.curve = curve;
    const n = Math.ceil(horizonSec / this.step) + 1;
    this.dist = new Array<number>(n);
    this.dist[0] = 0;
    for (let i = 1; i < n; i++) {
      const t0 = (i - 1) * this.step;
      const t1 = i * this.step;
      this.dist[i] = this.dist[i - 1] + ((this.speedAt(t0) + this.speedAt(t1)) / 2) * this.step;
    }
  }

  speedAt(t: number): number {
    const c = this.curve;
    if (t <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (t <= c[i][0]) {
        const [ta, va] = c[i - 1];
        const [tb, vb] = c[i];
        return va + ((vb - va) * (t - ta)) / (tb - ta);
      }
    }
    return c[c.length - 1][1];
  }

  distanceAt(t: number): number {
    const i = Math.floor(t / this.step);
    if (i >= this.dist.length - 1) {
      const last = this.dist.length - 1;
      return this.dist[last] + (t - last * this.step) * this.speedAt(t);
    }
    const frac = (t - i * this.step) / this.step;
    return this.dist[i] + (this.dist[i + 1] - this.dist[i]) * frac;
  }

  timeAtDistance(d: number): number {
    const arr = this.dist;
    if (d >= arr[arr.length - 1]) {
      const last = arr.length - 1;
      return last * this.step + (d - arr[last]) / this.speedAt(last * this.step);
    }
    let lo = 0;
    let hi = arr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = arr[hi] - arr[lo];
    return lo * this.step + (span > 0 ? ((d - arr[lo]) / span) * this.step : 0);
  }
}
