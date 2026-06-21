import type {
  Scene,
  SimulationResult,
  TrajectoryPoint,
  CollisionEvent,
  Vec2,
  ObstacleConfig,
} from './types.js';
import {
  PhysicsEnvironment,
  createIntegrator,
  degToRad,
  vecLength,
  vecReflect,
  type State,
} from './integrator.js';
import {
  lineIntersectsRect,
  lineIntersectsCircle,
  type LineCollisionResult,
} from './collision.js';
import { validateScene } from './scene.js';

const DEFAULT_RESTITUTION = 0.5;

export class PhysicsSimulator {
  private scene: Scene;
  private env: PhysicsEnvironment;
  private integrator: ReturnType<typeof createIntegrator>;
  private state: State;
  private time: number;
  private trajectory: TrajectoryPoint[];
  private firstCollision: CollisionEvent | undefined;
  private hit: boolean;
  private hitTargetId: string | undefined;
  private terminationReason: SimulationResult['terminationReason'];

  constructor(scene: Scene) {
    const validation = validateScene(scene);
    if (!validation.valid) {
      const errors = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`Invalid scene: ${errors}`);
    }

    this.scene = scene;
    this.env = new PhysicsEnvironment(scene.gravity, scene.wind);
    this.integrator = createIntegrator(scene.integrator);
    this.time = 0;
    this.trajectory = [];
    this.hit = false;
    this.terminationReason = 'timeout';

    const angleRad = degToRad(scene.launch.angleDegrees);
    const initialVelocity: Vec2 = {
      x: scene.launch.initialSpeed * Math.cos(angleRad),
      y: scene.launch.initialSpeed * Math.sin(angleRad),
    };

    this.state = {
      position: { ...scene.launch.position },
      velocity: initialVelocity,
    };

    this.recordTrajectoryPoint();
  }

  private recordTrajectoryPoint(): void {
    this.trajectory.push({
      time: this.time,
      position: { ...this.state.position },
      velocity: { ...this.state.velocity },
    });
  }

  public simulate(): SimulationResult {
    const dt = this.scene.timeStep;
    const maxTime = this.scene.maxSimulationTime;

    while (this.time < maxTime) {
      const stepResult = this.step(dt);

      if (stepResult === 'hit_target') {
        this.terminationReason = 'hit_target';
        break;
      }
      if (stepResult === 'collision_obstacle') {
        this.terminationReason = 'collision_obstacle';
        break;
      }
      if (stepResult === 'ground') {
        this.terminationReason = 'ground';
        break;
      }
      if (stepResult === 'out_of_bounds') {
        this.terminationReason = 'out_of_bounds';
        break;
      }

      if (this.time + dt >= maxTime) {
        this.terminationReason = 'timeout';
        break;
      }
    }

    return {
      hit: this.hit,
      hitTargetId: this.hitTargetId,
      firstCollision: this.firstCollision,
      trajectory: this.trajectory,
      totalTime: this.time,
      finalPosition: { ...this.state.position },
      finalVelocity: { ...this.state.velocity },
      terminationReason: this.terminationReason,
    };
  }

  private step(dt: number): SimulationResult['terminationReason'] | null {
    const prevPosition = { ...this.state.position };
    const newState = this.integrator(this.state, dt, this.time, this.env);
    const nextPosition = newState.position;

    const collision = this.checkContinuousCollision(prevPosition, nextPosition);

    if (collision && collision.t !== undefined && collision.t >= 0 && collision.t <= 1) {
      const collisionTime = this.time + collision.t * dt;
      const collisionPoint = collision.point!;
      const t = collision.t;

      const collisionVelocity: Vec2 = {
        x: this.state.velocity.x + (newState.velocity.x - this.state.velocity.x) * t,
        y: this.state.velocity.y + (newState.velocity.y - this.state.velocity.y) * t,
      };

      const obstacle = collision.obstacle!;
      const action = obstacle.onCollision ?? (obstacle.type === 'circle' ? 'stop' : 'bounce');
      const restitution = obstacle.restitution ?? DEFAULT_RESTITUTION;

      let postVelocity: Vec2;
      if (action === 'bounce' && collision.normal) {
        const reflected = vecReflect(collisionVelocity, collision.normal);
        postVelocity = {
          x: reflected.x * restitution,
          y: reflected.y * restitution,
        };
      } else {
        postVelocity = { x: 0, y: 0 };
      }

      this.time = collisionTime;
      this.state.position = { ...collisionPoint };
      this.state.velocity = postVelocity;
      this.recordTrajectoryPoint();

      this.firstCollision = {
        time: collisionTime,
        position: { ...collisionPoint },
        velocity: { ...postVelocity },
        obstacleId: obstacle.id,
        obstacleType: obstacle.type,
        action,
        remainingSpeed: vecLength(postVelocity),
      };

      if (obstacle.type === 'circle') {
        this.hit = true;
        this.hitTargetId = obstacle.id;
        return 'hit_target';
      } else {
        if (action === 'stop') {
          return 'collision_obstacle';
        } else {
          const remainingDt = dt * (1 - collision.t);
          if (remainingDt > 1e-12) {
            this.time += remainingDt;
            this.state = this.integrator(this.state, remainingDt, this.time, this.env);
            this.recordTrajectoryPoint();
          }
          return null;
        }
      }
    }

    this.time += dt;
    this.state = newState;
    this.recordTrajectoryPoint();

    if (this.scene.groundY !== undefined && this.state.position.y <= this.scene.groundY) {
      this.state.position.y = this.scene.groundY;
      this.state.velocity = { x: 0, y: 0 };
      this.trajectory[this.trajectory.length - 1]!.position = { ...this.state.position };
      this.trajectory[this.trajectory.length - 1]!.velocity = { ...this.state.velocity };
      return 'ground';
    }

    return null;
  }

  private checkContinuousCollision(
    p1: Vec2,
    p2: Vec2
  ): (LineCollisionResult & { obstacle: ObstacleConfig }) | null {
    let earliestCollision: (LineCollisionResult & { obstacle: ObstacleConfig }) | null = null;

    for (const obstacle of this.scene.obstacles) {
      let result: LineCollisionResult;

      if (obstacle.type === 'rect') {
        result = lineIntersectsRect(p1, p2, obstacle);
      } else {
        result = lineIntersectsCircle(p1, p2, obstacle);
      }

      if (result.collided && result.t !== undefined) {
        const t = Math.max(0, Math.min(1, result.t));
        if (earliestCollision === null || t < (earliestCollision.t ?? Infinity)) {
          earliestCollision = { ...result, obstacle };
        }
      }
    }

    return earliestCollision;
  }
}

export function simulate(scene: Scene): SimulationResult {
  const simulator = new PhysicsSimulator(scene);
  return simulator.simulate();
}

export function simulateWithOverride(
  scene: Scene,
  overrides: Partial<Scene['launch']>
): SimulationResult {
  const modifiedScene: Scene = {
    ...scene,
    launch: {
      ...scene.launch,
      ...overrides,
    },
  };
  return simulate(modifiedScene);
}
