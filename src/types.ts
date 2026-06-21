export interface Vec2 {
  x: number;
  y: number;
}

export interface LaunchParams {
  position: Vec2;
  angleDegrees: number;
  initialSpeed: number;
}

export interface WindParams {
  speed: number;
  directionDegrees: number;
}

export interface RectObstacle {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleTarget {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  radius: number;
}

export type Obstacle = RectObstacle | CircleTarget;

export type CollisionAction = 'bounce' | 'stop';

export interface RectObstacleConfig extends RectObstacle {
  onCollision?: CollisionAction;
  restitution?: number;
}

export interface CircleTargetConfig extends CircleTarget {
  onCollision?: CollisionAction;
  restitution?: number;
}

export type ObstacleConfig = RectObstacleConfig | CircleTargetConfig;

export type IntegratorType = 'semi-implicit-euler' | 'rk2';

export interface Scene {
  launch: LaunchParams;
  wind: WindParams;
  gravity: number;
  timeStep: number;
  maxSimulationTime: number;
  integrator: IntegratorType;
  obstacles: ObstacleConfig[];
  groundY?: number;
}

export interface TrajectoryPoint {
  time: number;
  position: Vec2;
  velocity: Vec2;
}

export interface CollisionEvent {
  time: number;
  position: Vec2;
  velocity: Vec2;
  obstacleId: string;
  obstacleType: 'rect' | 'circle';
  action: CollisionAction;
  remainingSpeed: number;
}

export interface SimulationResult {
  hit: boolean;
  hitTargetId?: string;
  firstCollision?: CollisionEvent;
  trajectory: TrajectoryPoint[];
  totalTime: number;
  finalPosition: Vec2;
  finalVelocity: Vec2;
  terminationReason: 'hit_target' | 'collision_obstacle' | 'ground' | 'timeout' | 'out_of_bounds';
  bounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
}

export interface SweepParams {
  angleRange: {
    min: number;
    max: number;
    step: number;
  };
  speedRange: {
    min: number;
    max: number;
    step: number;
  };
  sortBy?: 'time' | 'speed';
}

export interface SweepResult {
  totalCandidates: number;
  hits: Array<{
    angleDegrees: number;
    initialSpeed: number;
    hitTime: number;
    hitSpeed: number;
    targetId: string;
  }>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
