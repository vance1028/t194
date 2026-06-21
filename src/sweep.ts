import type { Scene, SweepParams, SweepResult } from './types.js';
import { simulateWithOverride } from './simulator.js';
import { vecLength } from './integrator.js';

export function runSweep(scene: Scene, params: SweepParams): SweepResult {
  const { angleRange, speedRange, sortBy = 'time' } = params;

  const hits: SweepResult['hits'] = [];
  let totalCandidates = 0;

  const angleSteps = Math.ceil((angleRange.max - angleRange.min) / angleRange.step) + 1;
  const speedSteps = Math.ceil((speedRange.max - speedRange.min) / speedRange.step) + 1;

  for (let i = 0; i < angleSteps; i++) {
    const angleDegrees = angleRange.min + i * angleRange.step;

    for (let j = 0; j < speedSteps; j++) {
      const initialSpeed = speedRange.min + j * speedRange.step;
      totalCandidates++;

      try {
        const result = simulateWithOverride(scene, { angleDegrees, initialSpeed });

        if (result.hit && result.hitTargetId && result.firstCollision) {
          const hitSpeed = vecLength(result.firstCollision.velocity);
          hits.push({
            angleDegrees,
            initialSpeed,
            hitTime: result.firstCollision.time,
            hitSpeed,
            targetId: result.hitTargetId,
          });
        }
      } catch {
        // 跳过无效参数组合
      }
    }
  }

  if (sortBy === 'time') {
    hits.sort((a, b) => a.hitTime - b.hitTime);
  } else {
    hits.sort((a, b) => a.hitSpeed - b.hitSpeed);
  }

  return {
    totalCandidates,
    hits,
  };
}

export function runSweepParallel(scene: Scene, params: SweepParams): SweepResult {
  return runSweep(scene, params);
}
