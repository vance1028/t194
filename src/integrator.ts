import type { Vec2, WindParams, IntegratorType } from './types.js';

export interface State {
  position: Vec2;
  velocity: Vec2;
}

export interface AccelerationProvider {
  getAcceleration(state: State, time: number): Vec2;
}

export class PhysicsEnvironment implements AccelerationProvider {
  private gravity: number;
  private windAcceleration: Vec2;

  constructor(gravity: number, wind: WindParams) {
    this.gravity = gravity;
    const windRad = (wind.directionDegrees * Math.PI) / 180;
    this.windAcceleration = {
      x: wind.speed * Math.cos(windRad),
      y: wind.speed * Math.sin(windRad),
    };
  }

  getAcceleration(_state: State, _time: number): Vec2 {
    return {
      x: this.windAcceleration.x,
      y: -this.gravity + this.windAcceleration.y,
    };
  }

  getWindAcceleration(): Vec2 {
    return { ...this.windAcceleration };
  }
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function integrateSemiImplicitEuler(
  state: State,
  dt: number,
  time: number,
  env: AccelerationProvider
): State {
  const acceleration = env.getAcceleration(state, time);
  const newVelocity = add(state.velocity, scale(acceleration, dt));
  const newPosition = add(state.position, scale(newVelocity, dt));
  return {
    position: newPosition,
    velocity: newVelocity,
  };
}

export function integrateRK2(
  state: State,
  dt: number,
  time: number,
  env: AccelerationProvider
): State {
  const k1v = env.getAcceleration(state, time);
  const k1p = state.velocity;

  const midState: State = {
    position: add(state.position, scale(k1p, dt / 2)),
    velocity: add(state.velocity, scale(k1v, dt / 2)),
  };

  const k2v = env.getAcceleration(midState, time + dt / 2);
  const k2p = midState.velocity;

  const newVelocity = add(state.velocity, scale(k2v, dt));
  const newPosition = add(state.position, scale(k2p, dt));

  return {
    position: newPosition,
    velocity: newVelocity,
  };
}

export function createIntegrator(type: IntegratorType) {
  switch (type) {
    case 'semi-implicit-euler':
      return integrateSemiImplicitEuler;
    case 'rk2':
      return integrateRK2;
    default:
      throw new Error(`Unknown integrator type: ${type}`);
  }
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function vecLength(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecNormalize(v: Vec2): Vec2 {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function vecReflect(v: Vec2, normal: Vec2): Vec2 {
  const d = vecDot(v, normal);
  return {
    x: v.x - 2 * d * normal.x,
    y: v.y - 2 * d * normal.y,
  };
}
