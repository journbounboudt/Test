/** Warms the Three.js chunk during boot so the first run starts without a long pause. */
export async function preloadCore() {
  await Promise.all([import('three'), import('./engine')]);
}
