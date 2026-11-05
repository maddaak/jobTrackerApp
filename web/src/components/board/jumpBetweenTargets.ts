import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

// dnd-kit's default 25px step took dozens of presses to cross one column; up/down step through
// targets stacked in one lane, like the Offer, Pause, and Close zones.
export const jumpBetweenTargets: KeyboardCoordinateGetter = (event, { context: { droppableRects, collisionRect } }) => {
  if (!collisionRect) return undefined;
  const horizontal = event.code === "ArrowRight" || event.code === "ArrowLeft";
  if (!horizontal && event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  event.preventDefault();

  const here = { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 };
  const sign = event.code === "ArrowRight" || event.code === "ArrowDown" ? 1 : -1;
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const rect of droppableRects.values()) {
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const along = horizontal ? (center.x - here.x) * sign : (center.y - here.y) * sign;
    const across = horizontal ? Math.abs(center.y - here.y) : Math.abs(center.x - here.x);
    // Ahead of the card, and for up/down within its lane.
    if (along <= 1 || (!horizontal && across > rect.width / 2)) continue;
    const distance = along + across;
    if (distance < bestDistance) {
      best = center;
      bestDistance = distance;
    }
  }
  return best ? { x: best.x - collisionRect.width / 2, y: best.y - collisionRect.height / 2 } : undefined;
};
