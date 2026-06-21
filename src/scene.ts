import fs from 'node:fs';
import type {
  Scene,
  ObstacleConfig,
  ValidationResult,
  ValidationError,
  IntegratorType,
  RectObstacleConfig,
  CircleTargetConfig,
} from './types.js';
import { checkObstacleOverlap } from './collision.js';

export function parseSceneFromFile(filePath: string): Scene {
  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = JSON.parse(content);
  return parseScene(raw);
}

export function parseScene(raw: unknown): Scene {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Scene must be an object');
  }

  const obj = raw as Record<string, unknown>;

  const launch = parseLaunch(obj.launch);
  const wind = parseWind(obj.wind);
  const gravity = parseNonNegativeNumber(obj.gravity, 'gravity', 9.81);
  const timeStep = parsePositiveNumber(obj.timeStep, 'timeStep');
  const maxSimulationTime = parsePositiveNumber(obj.maxSimulationTime, 'maxSimulationTime');
  const integrator = parseIntegrator(obj.integrator);
  const obstacles = parseObstacles(obj.obstacles);
  const groundY = parseOptionalNumber(obj.groundY, 'groundY');

  const result: Scene = {
    launch,
    wind,
    gravity,
    timeStep,
    maxSimulationTime,
    integrator,
    obstacles,
  };
  if (groundY !== undefined) {
    result.groundY = groundY;
  }
  return result;
}

function parseLaunch(raw: unknown): Scene['launch'] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('launch must be an object');
  }
  const obj = raw as Record<string, unknown>;

  const position = parseVec2(obj.position, 'launch.position');
  const angleDegrees = parseNumber(obj.angleDegrees, 'launch.angleDegrees');
  const initialSpeed = parsePositiveNumber(obj.initialSpeed, 'launch.initialSpeed');

  return { position, angleDegrees, initialSpeed };
}

function parseWind(raw: unknown): Scene['wind'] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('wind must be an object');
  }
  const obj = raw as Record<string, unknown>;

  const speed = parseNumber(obj.speed, 'wind.speed');
  const directionDegrees = parseNumber(obj.directionDegrees, 'wind.directionDegrees');

  return { speed, directionDegrees };
}

function parseVec2(raw: unknown, field: string): { x: number; y: number } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${field} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  return {
    x: parseNumber(obj.x, `${field}.x`),
    y: parseNumber(obj.y, `${field}.y`),
  };
}

function parseNumber(raw: unknown, field: string): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    throw new Error(`${field} must be a valid number`);
  }
  return raw;
}

function parseOptionalNumber(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  return parseNumber(raw, field);
}

function parsePositiveNumber(raw: unknown, field: string, defaultValue?: number): number {
  if (raw === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  const value = parseNumber(raw, field);
  if (value <= 0) {
    throw new Error(`${field} must be positive (got ${value})`);
  }
  return value;
}

function parseNonNegativeNumber(raw: unknown, field: string, defaultValue?: number): number {
  if (raw === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  const value = parseNumber(raw, field);
  if (value < 0) {
    throw new Error(`${field} must be non-negative (got ${value})`);
  }
  return value;
}

function parseIntegrator(raw: unknown): IntegratorType {
  if (raw === undefined || raw === null) {
    return 'semi-implicit-euler';
  }
  if (raw !== 'semi-implicit-euler' && raw !== 'rk2') {
    throw new Error(`integrator must be 'semi-implicit-euler' or 'rk2', got '${String(raw)}'`);
  }
  return raw;
}

function parseObstacles(raw: unknown): ObstacleConfig[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('obstacles must be an array');
  }
  return raw.map((item, index) => parseObstacle(item, `obstacles[${index}]`));
}

function parseObstacle(raw: unknown, field: string): ObstacleConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${field} must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  const id = parseString(obj.id, `${field}.id`);
  const type = obj.type;

  if (type === 'rect') {
    return parseRectObstacle(obj, field, id);
  } else if (type === 'circle') {
    return parseCircleTarget(obj, field, id);
  } else {
    throw new Error(`${field}.type must be 'rect' or 'circle', got '${String(type)}'`);
  }
}

function parseRectObstacle(
  obj: Record<string, unknown>,
  field: string,
  id: string
): RectObstacleConfig {
  const x = parseNumber(obj.x, `${field}.x`);
  const y = parseNumber(obj.y, `${field}.y`);
  const width = parsePositiveNumber(obj.width, `${field}.width`);
  const height = parsePositiveNumber(obj.height, `${field}.height`);
  const onCollision = parseCollisionAction(obj.onCollision, `${field}.onCollision`);
  const restitution = parseOptionalRestitution(obj.restitution, `${field}.restitution`);

  const result: RectObstacleConfig = { id, type: 'rect', x, y, width, height };
  if (onCollision !== undefined) result.onCollision = onCollision;
  if (restitution !== undefined) result.restitution = restitution;
  return result;
}

function parseCircleTarget(
  obj: Record<string, unknown>,
  field: string,
  id: string
): CircleTargetConfig {
  const x = parseNumber(obj.x, `${field}.x`);
  const y = parseNumber(obj.y, `${field}.y`);
  const radius = parsePositiveNumber(obj.radius, `${field}.radius`);
  const onCollision = parseCollisionAction(obj.onCollision, `${field}.onCollision`);
  const restitution = parseOptionalRestitution(obj.restitution, `${field}.restitution`);

  const result: CircleTargetConfig = { id, type: 'circle', x, y, radius };
  if (onCollision !== undefined) result.onCollision = onCollision;
  if (restitution !== undefined) result.restitution = restitution;
  return result;
}

function parseString(raw: unknown, field: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return raw;
}

function parseCollisionAction(
  raw: unknown,
  field: string
): 'bounce' | 'stop' | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw !== 'bounce' && raw !== 'stop') {
    throw new Error(`${field} must be 'bounce' or 'stop', got '${String(raw)}'`);
  }
  return raw;
}

function parseOptionalRestitution(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const value = parseNumber(raw, field);
  if (value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1, got ${value}`);
  }
  return value;
}

export function validateScene(scene: Scene): ValidationResult {
  const errors: ValidationError[] = [];

  if (scene.timeStep <= 0) {
    errors.push({
      field: 'timeStep',
      message: `timeStep must be positive, got ${scene.timeStep}`,
    });
  }

  if (scene.maxSimulationTime <= 0) {
    errors.push({
      field: 'maxSimulationTime',
      message: `maxSimulationTime must be positive, got ${scene.maxSimulationTime}`,
    });
  }

  if (scene.timeStep > scene.maxSimulationTime) {
    errors.push({
      field: 'timeStep',
      message: `timeStep (${scene.timeStep}) must not exceed maxSimulationTime (${scene.maxSimulationTime})`,
    });
  }

  if (scene.gravity < 0) {
    errors.push({
      field: 'gravity',
      message: `gravity must be non-negative, got ${scene.gravity}`,
    });
  }

  if (scene.launch.initialSpeed <= 0) {
    errors.push({
      field: 'launch.initialSpeed',
      message: `initialSpeed must be positive, got ${scene.launch.initialSpeed}`,
    });
  }

  const idSet = new Set<string>();
  for (let i = 0; i < scene.obstacles.length; i++) {
    const obs = scene.obstacles[i]!;
    if (idSet.has(obs.id)) {
      errors.push({
        field: `obstacles[${i}].id`,
        message: `Duplicate obstacle id: '${obs.id}'`,
      });
    }
    idSet.add(obs.id);
  }

  const circleTargets = scene.obstacles.filter(o => o.type === 'circle');
  if (circleTargets.length === 0) {
    errors.push({
      field: 'obstacles',
      message: 'At least one circle target is required',
    });
  }

  for (let i = 0; i < scene.obstacles.length; i++) {
    for (let j = i + 1; j < scene.obstacles.length; j++) {
      const o1 = scene.obstacles[i]!;
      const o2 = scene.obstacles[j]!;
      if (checkObstacleOverlap(o1, o2)) {
        errors.push({
          field: `obstacles`,
          message: `Obstacles '${o1.id}' and '${o2.id}' overlap`,
        });
      }
    }
  }

  const launchPos = scene.launch.position;
  for (const obs of scene.obstacles) {
    if (checkPointInsideObstacle(launchPos, obs)) {
      errors.push({
        field: 'launch.position',
        message: `Launch position is inside obstacle '${obs.id}'`,
      });
    }
  }

  if (scene.groundY !== undefined) {
    if (scene.launch.position.y < scene.groundY) {
      errors.push({
        field: 'launch.position.y',
        message: `Launch position y (${scene.launch.position.y}) is below ground (${scene.groundY})`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function checkPointInsideObstacle(
  point: { x: number; y: number },
  obs: ObstacleConfig
): boolean {
  if (obs.type === 'rect') {
    return (
      point.x >= obs.x &&
      point.x <= obs.x + obs.width &&
      point.y >= obs.y &&
      point.y <= obs.y + obs.height
    );
  } else {
    const dx = point.x - obs.x;
    const dy = point.y - obs.y;
    return dx * dx + dy * dy <= obs.radius * obs.radius;
  }
}

export function validateSceneFile(filePath: string): ValidationResult {
  try {
    const scene = parseSceneFromFile(filePath);
    return validateScene(scene);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      errors: [{ field: 'parse', message }],
    };
  }
}
