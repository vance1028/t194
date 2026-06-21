import type { Vec2, RectObstacle, CircleTarget } from './types.js';
import { vecDot } from './integrator.js';

const EPSILON = 1e-12;

export interface PointCollisionResult {
  collided: boolean;
  normal?: Vec2;
  penetrationDepth?: number;
}

export interface LineCollisionResult {
  collided: boolean;
  t?: number;
  point?: Vec2;
  normal?: Vec2;
}

export function pointInRect(point: Vec2, rect: RectObstacle): PointCollisionResult {
  const inside =
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;

  if (!inside) {
    return { collided: false };
  }

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const dx = point.x - centerX;
  const dy = point.y - centerY;

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  const distX = halfW - Math.abs(dx);
  const distY = halfH - Math.abs(dy);

  let normal: Vec2;
  let penetrationDepth: number;

  if (distX < distY) {
    normal = { x: dx < 0 ? -1 : 1, y: 0 };
    penetrationDepth = distX;
  } else {
    normal = { x: 0, y: dy < 0 ? -1 : 1 };
    penetrationDepth = distY;
  }

  return { collided: true, normal, penetrationDepth };
}

export function pointInCircle(point: Vec2, circle: CircleTarget): PointCollisionResult {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  const distSq = dx * dx + dy * dy;
  const radiusSq = circle.radius * circle.radius;

  if (distSq > radiusSq + EPSILON) {
    return { collided: false };
  }

  const dist = Math.sqrt(distSq);
  const normal = dist > EPSILON
    ? { x: dx / dist, y: dy / dist }
    : { x: 0, y: -1 };

  return {
    collided: true,
    normal,
    penetrationDepth: circle.radius - dist,
  };
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  if (Math.abs(discriminant) < EPSILON) {
    return [-b / (2 * a)];
  }
  const sqrtD = Math.sqrt(discriminant);
  return [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)];
}

export function lineIntersectsRect(
  p1: Vec2,
  p2: Vec2,
  rect: RectObstacle
): LineCollisionResult {
  const { x, y, width, height } = rect;
  const rx = x;
  const ry = y;
  const rw = width;
  const rh = height;

  let tMin = Infinity;
  let bestNormal: Vec2 | undefined;

  const edges = [
    { x1: rx, y1: ry, x2: rx + rw, y2: ry, normal: { x: 0, y: -1 } },
    { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh, normal: { x: 1, y: 0 } },
    { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh, normal: { x: 0, y: 1 } },
    { x1: rx, y1: ry + rh, x2: rx, y2: ry, normal: { x: -1, y: 0 } },
  ];

  for (const edge of edges) {
    const t = lineLineIntersection(
      p1.x, p1.y, p2.x, p2.y,
      edge.x1, edge.y1, edge.x2, edge.y2
    );
    if (t !== null && t >= -EPSILON && t <= 1 + EPSILON) {
      const clampedT = Math.max(0, Math.min(1, t));
      if (clampedT < tMin) {
        tMin = clampedT;
        bestNormal = edge.normal;
      }
    }
  }

  const startInside = pointInRect(p1, rect).collided;
  if (startInside && tMin === Infinity) {
    return {
      collided: true,
      t: 0,
      point: { ...p1 },
      normal: bestNormal || { x: 0, y: -1 },
    };
  }

  if (tMin <= 1 + EPSILON) {
    const intersectionPoint = {
      x: p1.x + tMin * (p2.x - p1.x),
      y: p1.y + tMin * (p2.y - p1.y),
    };
    return {
      collided: true,
      t: tMin,
      point: intersectionPoint,
      normal: bestNormal,
    };
  }

  return { collided: false };
}

function lineLineIntersection(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): number | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < EPSILON) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (u >= -EPSILON && u <= 1 + EPSILON) {
    return t;
  }
  return null;
}

export function lineIntersectsCircle(
  p1: Vec2,
  p2: Vec2,
  circle: CircleTarget
): LineCollisionResult {
  const cx = circle.x;
  const cy = circle.y;
  const r = circle.radius;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - cx;
  const fy = p1.y - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const roots = solveQuadratic(a, b, c);

  let tMin = Infinity;
  for (const t of roots) {
    if (t >= -EPSILON && t <= 1 + EPSILON) {
      const clampedT = Math.max(0, Math.min(1, t));
      if (clampedT < tMin) {
        tMin = clampedT;
      }
    }
  }

  const startInside = pointInCircle(p1, circle).collided;
  if (startInside && tMin === Infinity) {
    const hitPoint = { ...p1 };
    const nx = p1.x - cx;
    const ny = p1.y - cy;
    const dist = Math.sqrt(nx * nx + ny * ny);
    const normal = dist > EPSILON
      ? { x: nx / dist, y: ny / dist }
      : { x: 0, y: -1 };
    return {
      collided: true,
      t: 0,
      point: hitPoint,
      normal,
    };
  }

  if (tMin <= 1 + EPSILON) {
    const hitPoint = {
      x: p1.x + tMin * (p2.x - p1.x),
      y: p1.y + tMin * (p2.y - p1.y),
    };
    const nx = hitPoint.x - cx;
    const ny = hitPoint.y - cy;
    const dist = Math.sqrt(nx * nx + ny * ny);
    const normal = dist > EPSILON
      ? { x: nx / dist, y: ny / dist }
      : { x: 0, y: -1 };

    const direction = { x: dx, y: dy };
    if (vecDot(direction, normal) > 0) {
      normal.x = -normal.x;
      normal.y = -normal.y;
    }

    return {
      collided: true,
      t: tMin,
      point: hitPoint,
      normal,
    };
  }

  return { collided: false };
}

export function rectsOverlap(r1: RectObstacle, r2: RectObstacle): boolean {
  return !(
    r1.x + r1.width < r2.x ||
    r2.x + r2.width < r1.x ||
    r1.y + r1.height < r2.y ||
    r2.y + r2.height < r1.y
  );
}

export function circleRectOverlap(circle: CircleTarget, rect: RectObstacle): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;

  return dx * dx + dy * dy < circle.radius * circle.radius;
}

export function circlesOverlap(c1: CircleTarget, c2: CircleTarget): boolean {
  const dx = c1.x - c2.x;
  const dy = c1.y - c2.y;
  const distSq = dx * dx + dy * dy;
  const rSum = c1.radius + c2.radius;
  return distSq < rSum * rSum;
}

export function checkObstacleOverlap(
  o1: { type: string; x: number; y: number; width?: number; height?: number; radius?: number },
  o2: { type: string; x: number; y: number; width?: number; height?: number; radius?: number }
): boolean {
  if (o1.type === 'rect' && o2.type === 'rect') {
    return rectsOverlap(
      o1 as unknown as RectObstacle,
      o2 as unknown as RectObstacle
    );
  } else if (o1.type === 'circle' && o2.type === 'rect') {
    return circleRectOverlap(
      o1 as unknown as CircleTarget,
      o2 as unknown as RectObstacle
    );
  } else if (o1.type === 'rect' && o2.type === 'circle') {
    return circleRectOverlap(
      o2 as unknown as CircleTarget,
      o1 as unknown as RectObstacle
    );
  } else if (o1.type === 'circle' && o2.type === 'circle') {
    return circlesOverlap(
      o1 as unknown as CircleTarget,
      o2 as unknown as CircleTarget
    );
  }
  return false;
}
