import type { Scene } from './types.js';

export interface SampleScene {
  name: string;
  description: string;
  filename: string;
  scene: Scene;
}

export function getSampleScenes(): SampleScene[] {
  return [
    {
      name: 'simple_parabola',
      description: '无风无障碍的简单抛物线，验证解析解',
      filename: '01-simple-parabola.json',
      scene: {
        launch: {
          position: { x: 0, y: 0 },
          angleDegrees: 45,
          initialSpeed: 20,
        },
        wind: {
          speed: 0,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'target',
            type: 'circle',
            x: 40,
            y: 0,
            radius: 2,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      },
    },
    {
      name: 'wind_effect',
      description: '有横向风力的抛物线',
      filename: '02-wind-effect.json',
      scene: {
        launch: {
          position: { x: 0, y: 0 },
          angleDegrees: 60,
          initialSpeed: 25,
        },
        wind: {
          speed: 2,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 15,
        integrator: 'rk2',
        obstacles: [
          {
            id: 'target',
            type: 'circle',
            x: 70,
            y: 5,
            radius: 3,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      },
    },
    {
      name: 'obstacle_bounce',
      description: '包含矩形障碍物，碰撞后反弹',
      filename: '03-obstacle-bounce.json',
      scene: {
        launch: {
          position: { x: 0, y: 1 },
          angleDegrees: 30,
          initialSpeed: 30,
        },
        wind: {
          speed: 0,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.005,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'wall',
            type: 'rect',
            x: 30,
            y: 0,
            width: 2,
            height: 15,
            onCollision: 'bounce',
            restitution: 0.7,
          },
          {
            id: 'target',
            type: 'circle',
            x: 60,
            y: 10,
            radius: 2,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      },
    },
    {
      name: 'high_speed_thin_wall',
      description: '高速弹丸穿越薄墙，验证连续碰撞检测',
      filename: '04-high-speed-thin-wall.json',
      scene: {
        launch: {
          position: { x: 0, y: 5 },
          angleDegrees: 0,
          initialSpeed: 500,
        },
        wind: {
          speed: 0,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 2,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'thin_wall',
            type: 'rect',
            x: 10,
            y: 4,
            width: 0.1,
            height: 2,
            onCollision: 'stop',
          },
          {
            id: 'target',
            type: 'circle',
            x: 20,
            y: 5,
            radius: 1,
            onCollision: 'stop',
          },
        ],
      },
    },
    {
      name: 'multiple_targets',
      description: '多个目标和障碍物的复杂场景',
      filename: '05-multiple-targets.json',
      scene: {
        launch: {
          position: { x: 0, y: 2 },
          angleDegrees: 45,
          initialSpeed: 35,
        },
        wind: {
          speed: -1,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 15,
        integrator: 'rk2',
        obstacles: [
          {
            id: 'platform',
            type: 'rect',
            x: 20,
            y: 0,
            width: 10,
            height: 5,
            onCollision: 'bounce',
            restitution: 0.5,
          },
          {
            id: 'target_low',
            type: 'circle',
            x: 45,
            y: 5,
            radius: 2,
            onCollision: 'stop',
          },
          {
            id: 'target_high',
            type: 'circle',
            x: 60,
            y: 20,
            radius: 3,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      },
    },
    {
      name: 'sweep_test',
      description: '用于 sweep 搜索的场景',
      filename: '06-sweep-test.json',
      scene: {
        launch: {
          position: { x: 0, y: 1 },
          angleDegrees: 45,
          initialSpeed: 20,
        },
        wind: {
          speed: 0,
          directionDegrees: 0,
        },
        gravity: 9.81,
        timeStep: 0.01,
        maxSimulationTime: 10,
        integrator: 'semi-implicit-euler',
        obstacles: [
          {
            id: 'wall1',
            type: 'rect',
            x: 15,
            y: 0,
            width: 1,
            height: 8,
            onCollision: 'stop',
          },
          {
            id: 'target',
            type: 'circle',
            x: 35,
            y: 10,
            radius: 2,
            onCollision: 'stop',
          },
        ],
        groundY: 0,
      },
    },
  ];
}

export function getSampleSceneByName(name: string): SampleScene | undefined {
  return getSampleScenes().find(s => s.name === name);
}
