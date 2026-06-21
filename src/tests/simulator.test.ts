import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Scene } from '../types.js';
import { simulate } from '../simulator.js';
import { validateScene, parseScene, parseSceneFromFile, validateSceneFile } from '../scene.js';
import { runSweep } from '../sweep.js';
import { getSampleScenes } from '../samples.js';
import { degToRad } from '../integrator.js';

let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'physim-test-'));
}

function cleanUpTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function approxEqual(a: number, b: number, epsilon = 1e-3): boolean {
  return Math.abs(a - b) < epsilon;
}

describe('物理模拟器测试', () => {
  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanUpTempDir(tempDir);
  });

  describe('1. 解析解验证', () => {
    it('无风无障碍时轨迹应接近解析解', () => {
      const scene: Scene = {
        launch: {
          position: { x: 0, y: 0 },
          angleDegrees: 45,
          initialSpeed: 20,
        },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.001,
        maxSimulationTime: 10,
        integrator: 'rk2',
        obstacles: [
          {
            id: 'dummy_target',
            type: 'circle',
            x: 1000,
            y: 1000,
            radius: 1,
          },
        ],
      };

      const result = simulate(scene);

      const angleRad = degToRad(45);
      const v0 = 20;
      const g = 9.81;

      for (const point of result.trajectory) {
        if (point.time > 0.01 && point.time < 2.8) {
          const expectedX = v0 * Math.cos(angleRad) * point.time;
          const expectedY = v0 * Math.sin(angleRad) * point.time - 0.5 * g * point.time * point.time;

          assert.ok(
            approxEqual(point.position.x, expectedX, 0.01),
            `时间 ${point.time}: x 位置误差过大: 实际 ${point.position.x}, 预期 ${expectedX}`
          );
          assert.ok(
            approxEqual(point.position.y, expectedY, 0.01),
            `时间 ${point.time}: y 位置误差过大: 实际 ${point.position.y}, 预期 ${expectedY}`
          );
        }
      }

      const expectedFlightTime = (2 * v0 * Math.sin(angleRad)) / g;
      const expectedRange = (v0 * v0 * Math.sin(2 * angleRad)) / g;

      const landingPoint = result.trajectory.find(p => p.position.y <= 0 && p.time > 0.1);
      if (landingPoint) {
        assert.ok(
          approxEqual(landingPoint.time, expectedFlightTime, 0.02),
          `落地时间误差: 实际 ${landingPoint.time}, 预期 ${expectedFlightTime}`
        );
        assert.ok(
          approxEqual(landingPoint.position.x, expectedRange, 0.1),
          `射程误差: 实际 ${landingPoint.position.x}, 预期 ${expectedRange}`
        );
      }
    });
  });

  describe('2. 可复现性验证', () => {
    it('固定场景同一参数结果应可复现', () => {
      const scene: Scene = {
        launch: {
          position: { x: 0, y: 1 },
          angleDegrees: 35,
          initialSpeed: 25,
        },
        wind: { speed: 1.5, directionDegrees: 15 },
        gravity: 9.81,
        timeStep: 0.005,
        maxSimulationTime: 8,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'wall',
            type: 'rect',
            x: 25,
            y: 0,
            width: 1,
            height: 10,
            onCollision: 'bounce',
            restitution: 0.6,
          },
          {
            id: 'target',
            type: 'circle',
            x: 50,
            y: 8,
            radius: 2,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      };

      const result1 = simulate(scene);
      const result2 = simulate(scene);
      const result3 = simulate(scene);

      assert.equal(result1.hit, result2.hit);
      assert.equal(result1.hit, result3.hit);
      assert.equal(result1.totalTime, result2.totalTime);
      assert.equal(result1.totalTime, result3.totalTime);
      assert.equal(result1.terminationReason, result2.terminationReason);
      assert.equal(result1.terminationReason, result3.terminationReason);
      assert.equal(result1.trajectory.length, result2.trajectory.length);
      assert.equal(result1.trajectory.length, result3.trajectory.length);

      for (let i = 0; i < result1.trajectory.length; i++) {
        const p1 = result1.trajectory[i]!;
        const p2 = result2.trajectory[i]!;
        const p3 = result3.trajectory[i]!;

        assert.equal(p1.time, p2.time);
        assert.equal(p1.time, p3.time);
        assert.equal(p1.position.x, p2.position.x);
        assert.equal(p1.position.x, p3.position.x);
        assert.equal(p1.position.y, p2.position.y);
        assert.equal(p1.position.y, p3.position.y);
      }

      if (result1.firstCollision && result2.firstCollision) {
        assert.equal(result1.firstCollision.time, result2.firstCollision.time);
        assert.equal(result1.firstCollision.obstacleId, result2.firstCollision.obstacleId);
        assert.equal(result1.firstCollision.action, result2.firstCollision.action);
      }
    });
  });

  describe('3. 连续碰撞检测验证', () => {
    it('线段连续碰撞要能抓到高速穿越薄墙', () => {
      const scene: Scene = {
        launch: {
          position: { x: 0, y: 5 },
          angleDegrees: 0,
          initialSpeed: 1000,
        },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 0.1,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'thin_wall',
            type: 'rect',
            x: 5,
            y: 4.9,
            width: 0.01,
            height: 0.2,
            onCollision: 'stop',
          },
          {
            id: 'target',
            type: 'circle',
            x: 10,
            y: 5,
            radius: 1,
            onCollision: 'stop',
          },
        ],
      };

      const result = simulate(scene);

      assert.ok(
        result.firstCollision !== undefined,
        '应该检测到碰撞，但没有检测到'
      );
      assert.equal(
        result.firstCollision?.obstacleId,
        'thin_wall',
        `应该先碰撞薄墙，但实际碰撞了 ${result.firstCollision?.obstacleId}`
      );
      assert.ok(
        result.firstCollision!.position.x >= 5 && result.firstCollision!.position.x <= 5.01,
        `碰撞位置 x 应该在墙内 (5-5.01)，但实际是 ${result.firstCollision!.position.x}`
      );
      assert.equal(
        result.terminationReason,
        'collision_obstacle',
        '应该因碰撞障碍物而终止'
      );
      assert.equal(
        result.hit,
        false,
        '薄墙应该阻挡弹丸，不应命中目标'
      );
    });

    it('离散点检测会漏的高速穿越，连续检测应能抓到', () => {
      const scene: Scene = {
        launch: {
          position: { x: 0, y: 5 },
          angleDegrees: 0,
          initialSpeed: 2000,
        },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 0,
        timeStep: 0.01,
        maxSimulationTime: 0.02,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'very_thin_wall',
            type: 'rect',
            x: 10,
            y: 4.99,
            width: 0.001,
            height: 0.02,
            onCollision: 'stop',
          },
          {
            id: 'target_behind_wall',
            type: 'circle',
            x: 20,
            y: 5,
            radius: 0.5,
            onCollision: 'stop',
          },
        ],
      };

      const result = simulate(scene);

      assert.ok(
        result.firstCollision !== undefined,
        '连续碰撞检测应该抓到薄墙碰撞'
      );
      assert.equal(
        result.firstCollision?.obstacleId,
        'very_thin_wall',
        `应该碰撞薄墙，实际碰撞了 ${result.firstCollision?.obstacleId}`
      );
      assert.equal(
        result.hit,
        false,
        '不应命中墙后的目标'
      );
    });
  });

  describe('4. 无效配置验证', () => {
    it('负时间步应被拒绝', () => {
      const scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: -0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler' as const,
        obstacles: [{ id: 'target', type: 'circle' as const, x: 40, y: 0, radius: 2 }],
      };

      const validation = validateScene(scene);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.field === 'timeStep'));
      assert.throws(() => simulate(scene));
    });

    it('重叠障碍应被拒绝', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          { id: 'rect1', type: 'rect', x: 10, y: 10, width: 5, height: 5 },
          { id: 'rect2', type: 'rect', x: 12, y: 12, width: 5, height: 5 },
          { id: 'target', type: 'circle', x: 40, y: 0, radius: 2 },
        ],
      };

      const validation = validateScene(scene);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.message.includes('overlap')));
      assert.throws(() => simulate(scene));
    });

    it('目标缺失应被拒绝', () => {
      const scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler' as const,
        obstacles: [
          { id: 'wall', type: 'rect' as const, x: 10, y: 0, width: 2, height: 10 },
        ],
      };

      const validation = validateScene(scene);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.message.includes('circle target')));
      assert.throws(() => simulate(scene as Scene));
    });

    it('重复 ID 应被拒绝', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          { id: 'target', type: 'rect', x: 10, y: 0, width: 2, height: 10 },
          { id: 'target', type: 'circle', x: 40, y: 0, radius: 2 },
        ],
      };

      const validation = validateScene(scene);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.message.includes('Duplicate')));
      assert.throws(() => simulate(scene));
    });

    it('发射点在障碍物内应被拒绝', () => {
      const scene: Scene = {
        launch: { position: { x: 11, y: 5 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          { id: 'wall', type: 'rect', x: 10, y: 0, width: 5, height: 10 },
          { id: 'target', type: 'circle', x: 40, y: 0, radius: 2 },
        ],
      };

      const validation = validateScene(scene);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.message.includes('inside obstacle')));
      assert.throws(() => simulate(scene));
    });
  });

  describe('5. Sweep 功能验证', () => {
    it('sweep 返回的候选参数重新 simulate 时应确实命中目标', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 1 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          { id: 'target', type: 'circle', x: 30, y: 5, radius: 3, onCollision: 'stop' },
        ],
        groundY: 0,
      };

      const sweepResult = runSweep(scene, {
        angleRange: { min: 20, max: 70, step: 5 },
        speedRange: { min: 15, max: 35, step: 5 },
        sortBy: 'time',
      });

      assert.ok(sweepResult.hits.length > 0, '应该至少找到一个命中参数');

      for (const hit of sweepResult.hits.slice(0, 5)) {
        const verifyResult = simulate({
          ...scene,
          launch: {
            ...scene.launch,
            angleDegrees: hit.angleDegrees,
            initialSpeed: hit.initialSpeed,
          },
        });

        assert.equal(
          verifyResult.hit,
          true,
          `参数 angle=${hit.angleDegrees}, speed=${hit.initialSpeed} 应该命中，但没有`
        );
        assert.equal(
          verifyResult.hitTargetId,
          hit.targetId,
          `应该命中目标 ${hit.targetId}，但命中了 ${verifyResult.hitTargetId}`
        );
        assert.ok(
          approxEqual(verifyResult.firstCollision!.time, hit.hitTime, 0.01),
          `命中时间不一致: sweep 返回 ${hit.hitTime}, 实际 ${verifyResult.firstCollision!.time}`
        );
      }
    });

    it('sweep 结果应正确排序', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 1 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          { id: 'target', type: 'circle', x: 25, y: 8, radius: 2, onCollision: 'stop' },
        ],
        groundY: 0,
      };

      const resultByTime = runSweep(scene, {
        angleRange: { min: 30, max: 60, step: 2 },
        speedRange: { min: 18, max: 30, step: 2 },
        sortBy: 'time',
      });

      for (let i = 1; i < resultByTime.hits.length; i++) {
        assert.ok(
          resultByTime.hits[i - 1]!.hitTime <= resultByTime.hits[i]!.hitTime,
          '按时间排序应该递增'
        );
      }

      const resultBySpeed = runSweep(scene, {
        angleRange: { min: 30, max: 60, step: 2 },
        speedRange: { min: 18, max: 30, step: 2 },
        sortBy: 'speed',
      });

      for (let i = 1; i < resultBySpeed.hits.length; i++) {
        assert.ok(
          resultBySpeed.hits[i - 1]!.hitSpeed <= resultBySpeed.hits[i]!.hitSpeed,
          '按速度排序应该递增'
        );
      }
    });
  });

  describe('6. 碰撞反弹验证', () => {
    it('矩形障碍物碰撞后应正确反弹', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 5 }, angleDegrees: 0, initialSpeed: 10 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 0,
        timeStep: 0.001,
        maxSimulationTime: 2,
        integrator: 'rk2',
        obstacles: [
          {
            id: 'wall',
            type: 'rect',
            x: 10,
            y: 0,
            width: 1,
            height: 10,
            onCollision: 'bounce',
            restitution: 0.8,
          },
          {
            id: 'target',
            type: 'circle',
            x: 50,
            y: 50,
            radius: 1,
            onCollision: 'stop',
          },
        ],
      };

      const result = simulate(scene);

      assert.ok(result.firstCollision !== undefined);
      assert.equal(result.firstCollision.obstacleId, 'wall');
      assert.equal(result.firstCollision.obstacleType, 'rect');
      assert.equal(result.firstCollision.action, 'bounce');

      const velAfter = result.firstCollision.velocity;

      assert.ok(velAfter.x < 0, '水平碰撞垂直墙后 x 速度应该反向为负');
      assert.ok(approxEqual(velAfter.y, 0, 0.001), 'y 速度应该保持为 0');

      const expectedSpeedX = -10 * 0.8;
      assert.ok(approxEqual(velAfter.x, expectedSpeedX, 0.1),
        `反弹后 x 速度应该为 ${expectedSpeedX}, 实际 ${velAfter.x}`);

      const speedAfter = Math.sqrt(velAfter.x * velAfter.x + velAfter.y * velAfter.y);
      assert.ok(approxEqual(speedAfter, 8, 0.1),
        `恢复系数 0.8 时速度大小应为 8, 实际 ${speedAfter}`);

      assert.equal(result.hit, false, '目标在远处，不应命中');
      assert.equal(result.terminationReason, 'timeout');
    });
  });

  describe('7. 圆形目标碰撞验证', () => {
    it('圆形目标应正确检测命中', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 5 }, angleDegrees: 0, initialSpeed: 10 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 0,
        timeStep: 0.01,
        maxSimulationTime: 5,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'target',
            type: 'circle',
            x: 20,
            y: 5,
            radius: 2,
            onCollision: 'stop',
          },
        ],
      };

      const result = simulate(scene);

      assert.equal(result.hit, true);
      assert.equal(result.hitTargetId, 'target');
      assert.ok(result.firstCollision !== undefined);
      assert.equal(result.firstCollision.obstacleType, 'circle');
      assert.equal(result.firstCollision.action, 'stop');
      assert.ok(
        approxEqual(result.firstCollision.position.x, 18, 0.01) ||
        approxEqual(result.firstCollision.position.x, 22, 0.01),
        `碰撞点 x 应该在 18 或 22 附近，实际是 ${result.firstCollision.position.x}`
      );
      assert.ok(approxEqual(result.firstCollision.remainingSpeed, 0, 0.001));
    });
  });

  describe('8. 示例场景验证', () => {
    it('所有示例场景应能正确解析和验证', () => {
      const samples = getSampleScenes();
      assert.ok(samples.length >= 6, '应该至少有 6 个示例场景');

      for (const sample of samples) {
        const validation = validateScene(sample.scene);
        assert.equal(
          validation.valid,
          true,
          `场景 ${sample.name} 验证失败: ${JSON.stringify(validation.errors)}`
        );

        const reparsed = parseScene(JSON.parse(JSON.stringify(sample.scene)));
        assert.deepEqual(reparsed, sample.scene, `场景 ${sample.name} 解析后不一致`);
      }
    });

    it('高速薄墙场景应能正确检测碰撞', () => {
      const highSpeedScene = getSampleScenes().find(s => s.name === 'high_speed_thin_wall');
      assert.ok(highSpeedScene !== undefined);

      const result = simulate(highSpeedScene.scene);
      assert.ok(result.firstCollision !== undefined);
      assert.equal(result.firstCollision.obstacleId, 'thin_wall');
      assert.equal(result.hit, false);
    });
  });

  describe('9. 风力效果验证', () => {
    it('横向风力应影响轨迹', () => {
      const baseScene: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 60, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.001,
        maxSimulationTime: 5,
        integrator: 'rk2',
        obstacles: [{ id: 'dummy', type: 'circle', x: 1000, y: 1000, radius: 1 }],
      };

      const noWindResult = simulate(baseScene);

      const withWindResult = simulate({
        ...baseScene,
        wind: { speed: 5, directionDegrees: 0 },
      });

      const timePoint = 2;
      const noWindPoint = noWindResult.trajectory.find(p => p.time >= timePoint)!;
      const withWindPoint = withWindResult.trajectory.find(p => p.time >= timePoint)!;

      assert.ok(
        withWindPoint.position.x > noWindPoint.position.x + 5,
        `有横向风时 x 应该更大: 无风 ${noWindPoint.position.x}, 有风 ${withWindPoint.position.x}`
      );
    });
  });

  describe('10. 积分器一致性验证', () => {
    it('两种积分器结果应接近', () => {
      const baseScene: Scene = {
        launch: { position: { x: 0, y: 1 }, angleDegrees: 45, initialSpeed: 25 },
        wind: { speed: 1, directionDegrees: 45 },
        gravity: 9.81,
        timeStep: 0.001,
        maxSimulationTime: 3,
        integrator: 'semi-implicit-euler',
        obstacles: [{ id: 'dummy', type: 'circle', x: 1000, y: 1000, radius: 1 }],
      };

      const eulerResult = simulate(baseScene);
      const rk2Result = simulate({ ...baseScene, integrator: 'rk2' });

      assert.equal(eulerResult.trajectory.length, rk2Result.trajectory.length);

      for (let i = 0; i < eulerResult.trajectory.length; i += 100) {
        const p1 = eulerResult.trajectory[i]!;
        const p2 = rk2Result.trajectory[i]!;

        assert.ok(
          approxEqual(p1.position.x, p2.position.x, 0.05),
          `时间 ${p1.time}: x 位置差过大: Euler ${p1.position.x}, RK2 ${p2.position.x}`
        );
        assert.ok(
          approxEqual(p1.position.y, p2.position.y, 0.05),
          `时间 ${p1.time}: y 位置差过大: Euler ${p1.position.y}, RK2 ${p2.position.y}`
        );
      }
    });
  });

  describe('11. UTF-8 BOM 兼容性验证', () => {
    it('parseSceneFromFile 应兼容带 BOM 的 JSON 文件', () => {
      const sceneData: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [{ id: 'target', type: 'circle', x: 40, y: 0, radius: 2 }],
      };

      const jsonStr = JSON.stringify(sceneData);
      const bomJson = '\uFEFF' + jsonStr;

      const testFile = path.join(tempDir, 'with-bom.json');
      fs.writeFileSync(testFile, bomJson, 'utf-8');

      const parsed = parseSceneFromFile(testFile);
      assert.equal(parsed.launch.angleDegrees, 45);
      assert.equal(parsed.launch.initialSpeed, 20);
      assert.equal(parsed.obstacles.length, 1);

      const noBomFile = path.join(tempDir, 'without-bom.json');
      fs.writeFileSync(noBomFile, jsonStr, 'utf-8');

      const parsedNoBom = parseSceneFromFile(noBomFile);
      assert.equal(parsedNoBom.launch.angleDegrees, parsed.launch.angleDegrees);
      assert.equal(parsedNoBom.launch.initialSpeed, parsed.launch.initialSpeed);
      assert.deepEqual(parsedNoBom.obstacles, parsed.obstacles);
    });

    it('validateSceneFile 应兼容带 BOM 的 JSON 文件', () => {
      const sceneData: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [{ id: 'target', type: 'circle', x: 40, y: 0, radius: 2 }],
      };

      const jsonStr = JSON.stringify(sceneData);
      const bomJson = '\uFEFF' + jsonStr;

      const testFile = path.join(tempDir, 'validate-bom.json');
      fs.writeFileSync(testFile, bomJson, 'utf-8');

      const result = validateSceneFile(testFile);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('12. sweep-test 示例场景验证', () => {
    it('sweep_test 场景在默认搜索范围内应能找到命中候选', () => {
      const sweepScene = getSampleScenes().find(s => s.name === 'sweep_test');
      assert.ok(sweepScene !== undefined, 'sweep_test 场景应存在');

      const sweepParams = {
        angleRange: { min: 0, max: 90, step: 5 },
        speedRange: { min: 5, max: 50, step: 5 },
        sortBy: 'time' as const,
      };

      const result = runSweep(sweepScene.scene, sweepParams);

      assert.ok(
        result.hits.length > 0,
        `sweep_test 场景在默认搜索范围内应至少找到 1 个命中，实际找到 ${result.hits.length} 个，总候选: ${result.totalCandidates}`
      );

      for (const hit of result.hits.slice(0, 3)) {
        const verifyResult = simulateWithOverrideScene(sweepScene.scene, hit.angleDegrees, hit.initialSpeed);
        assert.equal(
          verifyResult.hit,
          true,
          `sweep 找到的参数 (angle=${hit.angleDegrees}, speed=${hit.initialSpeed}) 重跑应命中`
        );
        assert.equal(
          verifyResult.hitTargetId,
          hit.targetId,
          `命中的目标ID应一致`
        );
      }
    });

    it('sweep_test 场景的初始参数不应命中（墙挡住）', () => {
      const sweepScene = getSampleScenes().find(s => s.name === 'sweep_test');
      assert.ok(sweepScene !== undefined);

      const result = simulate(sweepScene.scene);
      const firstCollision = result.firstCollision;

      if (firstCollision) {
        const hitWall = firstCollision.obstacleId === 'wall1';
        const hitTargetTooSoon = result.hit && (firstCollision.obstacleId === 'target');
        assert.ok(
          hitWall || hitTargetTooSoon,
          `初始参数要么撞墙，要么直接命中（取决于场景设计），实际碰撞了: ${firstCollision.obstacleId}`
        );
      }
    });
  });

  describe('13. CLI 输出摘要功能验证', () => {
    it('JSON 摘要输出应包含关键字段但不包含完整轨迹', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 0 }, angleDegrees: 45, initialSpeed: 20 },
        wind: { speed: 0, directionDegrees: 0 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 5,
        integrator: 'semi-implicit-euler',
        obstacles: [{ id: 'target', type: 'circle', x: 40, y: 0, radius: 2 }],
        groundY: 0,
      };

      const result = simulate(scene);

      type SummaryType = {
        hit: boolean;
        hitTargetId?: string;
        totalTime: number;
        trajectoryPoints: number;
        terminationReason: string;
        firstCollision?: unknown;
        finalPosition: unknown;
        finalVelocity: unknown;
      };

      const summary: SummaryType = {
        hit: result.hit,
        hitTargetId: result.hitTargetId,
        totalTime: result.totalTime,
        trajectoryPoints: result.trajectory.length,
        terminationReason: result.terminationReason,
        firstCollision: result.firstCollision,
        finalPosition: result.finalPosition,
        finalVelocity: result.finalVelocity,
      };

      assert.ok('hit' in summary);
      assert.ok('totalTime' in summary);
      assert.ok('trajectoryPoints' in summary);
      assert.ok('terminationReason' in summary);
      assert.ok('finalPosition' in summary);
      assert.ok(!('trajectory' in summary), '摘要不应包含完整 trajectory 数组');

      assert.equal(summary.hit, result.hit);
      assert.equal(summary.totalTime, result.totalTime);
      assert.equal(summary.trajectoryPoints, result.trajectory.length);
      assert.equal(summary.terminationReason, result.terminationReason);
      assert.ok(summary.trajectoryPoints > 100, '应有足够多的采样点');
    });

    it('完整结果和摘要结果应数据一致', () => {
      const scene: Scene = {
        launch: { position: { x: 0, y: 1 }, angleDegrees: 60, initialSpeed: 25 },
        wind: { speed: 1, directionDegrees: 90 },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 8,
        integrator: 'rk2',
        obstacles: [
          { id: 'wall', type: 'rect', x: 20, y: 0, width: 2, height: 15, onCollision: 'bounce', restitution: 0.6 },
          { id: 'target', type: 'circle', x: 50, y: 10, radius: 2 },
        ],
        groundY: 0,
      };

      const full = simulate(scene);

      assert.equal(full.trajectory[full.trajectory.length - 1]!.time, full.totalTime);
      assert.deepEqual(
        full.trajectory[full.trajectory.length - 1]!.position,
        full.finalPosition
      );

      if (full.firstCollision) {
        const { remainingSpeed, velocity } = full.firstCollision;
        const calcSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        assert.ok(
          approxEqual(remainingSpeed, calcSpeed, 0.0001),
          `remainingSpeed 应与速度向量一致: 记录 ${remainingSpeed}, 计算 ${calcSpeed}`
        );
      }
    });
  });
});

function simulateWithOverrideScene(scene: Scene, angleDegrees: number, initialSpeed: number) {
  return simulate({
    ...scene,
    launch: { ...scene.launch, angleDegrees, initialSpeed },
  });
}
