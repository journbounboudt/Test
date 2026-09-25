import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Hero runner GLB built by tools/blender/build_runner.py (meshopt-compressed by gltfpack). */
export const RUNNER_MODEL_URL = `${import.meta.env.BASE_URL}models/runner.glb`;

export interface RunnerAsset {
  gltf: GLTF;
  clips: Map<string, THREE.AnimationClip>;
}

let asset: RunnerAsset | null = null;
let pending: Promise<void> | null = null;

/** Loads and caches the runner model. Never rejects: on failure RunnerModel uses its procedural fallback. */
export function loadRunnerAsset(): Promise<void> {
  if (asset) return Promise.resolve();
  if (!pending) {
    pending = (async () => {
      try {
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(RUNNER_MODEL_URL);
        const clips = new Map<string, THREE.AnimationClip>();
        for (const clip of gltf.animations) {
          // Strafe clips start at the rest pose, so frame 0 is the additive reference.
          if (clip.name.startsWith('Strafe')) THREE.AnimationUtils.makeClipAdditive(clip, 0);
          clips.set(clip.name, clip);
        }
        asset = { gltf, clips };
      } catch (err) {
        console.warn('[runner] model failed to load, using procedural fallback', err);
        pending = null;
      }
    })();
  }
  return pending ?? Promise.resolve();
}

export function runnerAsset(): RunnerAsset | null {
  return asset;
}
