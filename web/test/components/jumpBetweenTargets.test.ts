import { describe, it, expect } from "vitest";
import type { ClientRect, SensorContext } from "@dnd-kit/core";
import { jumpBetweenTargets } from "../../src/components/board/jumpBetweenTargets";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

// Four 180px columns, then the three exit zones stacked in a lane on the right.
const targets = new Map<string, ClientRect>([
  ["CONTACTED", rect(0, 0, 180, 600)],
  ["INITIAL_SCREEN", rect(200, 0, 180, 600)],
  ["MID_ROUNDS", rect(400, 0, 180, 600)],
  ["PANEL", rect(600, 0, 180, 600)],
  ["OFFER_ZONE", rect(800, 0, 160, 180)],
  ["PAUSE_ZONE", rect(800, 200, 160, 180)],
  ["CLOSE_ZONE", rect(800, 400, 160, 180)],
]);
const CARD = { width: 160, height: 80 };

function press(code: string, from: string): string | undefined {
  const start = targets.get(from)!;
  const card = rect(start.left + start.width / 2 - CARD.width / 2, start.top + start.height / 2 - CARD.height / 2,
    CARD.width, CARD.height);
  const context = { droppableRects: targets, collisionRect: card } as unknown as SensorContext;
  const moved = jumpBetweenTargets(new KeyboardEvent("keydown", { code }), {
    active: 1, currentCoordinates: { x: card.left, y: card.top }, context,
  });
  if (!moved) return undefined;
  const center = { x: moved.x + CARD.width / 2, y: moved.y + CARD.height / 2 };
  return [...targets].find(([, r]) => r.left + r.width / 2 === center.x && r.top + r.height / 2 === center.y)?.[0];
}

describe("jumpBetweenTargets", () => {
  it("crosses one column per left or right press", () => {
    expect(press("ArrowRight", "CONTACTED")).toBe("INITIAL_SCREEN");
    expect(press("ArrowRight", "MID_ROUNDS")).toBe("PANEL");
    expect(press("ArrowLeft", "PANEL")).toBe("MID_ROUNDS");
    expect(press("ArrowLeft", "CONTACTED")).toBeUndefined();
  });

  it("steps through the exit zones with up and down, and goes no further", () => {
    expect(press("ArrowDown", "OFFER_ZONE")).toBe("PAUSE_ZONE");
    expect(press("ArrowDown", "PAUSE_ZONE")).toBe("CLOSE_ZONE");
    expect(press("ArrowUp", "CLOSE_ZONE")).toBe("PAUSE_ZONE");
    expect(press("ArrowDown", "CLOSE_ZONE")).toBeUndefined();
  });

  it("does not move a card within a column, which has nothing above or below it", () => {
    expect(press("ArrowDown", "MID_ROUNDS")).toBeUndefined();
  });

  it("leaves other keys to the sensor", () => {
    expect(press("KeyA", "CONTACTED")).toBeUndefined();
  });
});
