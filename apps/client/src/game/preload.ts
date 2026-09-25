/** Warms the Three.js chunk and the hero model during boot so the first run starts without a long pause. */
export async function preloadCore() {
  await Promise.all([import('three'), import('./engine'), import('./runnerAsset').then((m) => m.loadRunnerAsset())]);
}
