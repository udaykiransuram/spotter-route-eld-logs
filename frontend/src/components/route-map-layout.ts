export interface MarkerScreenPoint {
  id: string;
  sequence: number;
  x: number;
  y: number;
}

export interface MarkerDisplacement {
  x: number;
  y: number;
}

export const MARKER_COLLISION_DISTANCE = 38;

export interface PersistentFailureTracker {
  recordFailure: () => boolean;
  reset: () => void;
}

/**
 * Reports persistent failure only after a burst reaches the threshold. A map
 * `idle` event resets the tracker, so isolated or recovered tile errors do not
 * replace an otherwise useful map.
 */
export function createPersistentFailureTracker(threshold: number): PersistentFailureTracker {
  let failureCount = 0;

  return {
    recordFailure: () => {
      failureCount += 1;
      return failureCount >= threshold;
    },
    reset: () => {
      failureCount = 0;
    },
  };
}

/**
 * Separates small groups of nearby stop badges in screen space. Each group is
 * spread along its local route direction in chronological order; coincident
 * stops use a stable left-to-right sequence. The caller keeps each map marker
 * at its true coordinate and applies only these offsets.
 */
export function calculateMarkerDisplacements(
  points: MarkerScreenPoint[],
  collisionDistance = MARKER_COLLISION_DISTANCE,
): Map<string, MarkerDisplacement> {
  const displacements = new Map(
    points.map((point) => [point.id, { x: 0, y: 0 }]),
  );
  const visited = new Set<number>();

  for (let startIndex = 0; startIndex < points.length; startIndex += 1) {
    if (visited.has(startIndex)) continue;

    const component: number[] = [];
    const pending = [startIndex];
    visited.add(startIndex);

    while (pending.length > 0) {
      const pointIndex = pending.pop();
      if (pointIndex === undefined) break;
      component.push(pointIndex);

      for (let candidateIndex = 0; candidateIndex < points.length; candidateIndex += 1) {
        if (visited.has(candidateIndex)) continue;
        const point = points[pointIndex];
        const candidate = points[candidateIndex];
        if (Math.hypot(point.x - candidate.x, point.y - candidate.y) < collisionDistance) {
          visited.add(candidateIndex);
          pending.push(candidateIndex);
        }
      }
    }

    if (component.length < 2) continue;

    const groupedPoints = component
      .map((pointIndex) => points[pointIndex])
      .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
    const center = groupedPoints.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    center.x /= groupedPoints.length;
    center.y /= groupedPoints.length;

    const firstPoint = groupedPoints[0];
    const lastPoint = groupedPoints.at(-1) ?? firstPoint;
    let axisX = lastPoint.x - firstPoint.x;
    let axisY = lastPoint.y - firstPoint.y;
    let axisLength = Math.hypot(axisX, axisY);

    if (axisLength < 1) {
      axisX = 1;
      axisY = 0;
      axisLength = 1;
    }

    axisX /= axisLength;
    axisY /= axisLength;
    const firstOffset = -((groupedPoints.length - 1) * collisionDistance) / 2;

    groupedPoints.forEach((point, index) => {
      const sequenceOffset = firstOffset + index * collisionDistance;
      const targetX = center.x + axisX * sequenceOffset;
      const targetY = center.y + axisY * sequenceOffset;
      displacements.set(point.id, { x: targetX - point.x, y: targetY - point.y });
    });
  }

  return displacements;
}
