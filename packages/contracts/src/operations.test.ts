import { describe, expect, it } from "vitest";
import { DGA_CONDITION_LIMITS, DUVAL_ZONE_SHAPES, DuvalZone, dgaCondition, duvalZone } from "./operations";

describe("Duval triangle 1", () => {
  it("classifies textbook gas mixes", () => {
    expect(duvalZone(99, 1, 0)).toBe("PD"); // almost all methane: partial discharge
    expect(duvalZone(85, 13, 2)).toBe("T1"); // low-temperature hot spot
    expect(duvalZone(60, 38, 2)).toBe("T2");
    expect(duvalZone(30, 65, 5)).toBe("T3"); // mostly ethylene: very hot
    expect(duvalZone(50, 10, 40)).toBe("D1"); // acetylene without much ethylene: sparking
    expect(duvalZone(20, 30, 50)).toBe("D2"); // lots of both: arcing
    expect(duvalZone(70, 22, 8)).toBe("DT");
  });

  it("puts boundary values on the documented side", () => {
    expect(duvalZone(80, 20, 0)).toBe("T2"); // 20% ethylene starts T2
    expect(duvalZone(50, 50, 0)).toBe("T3");
    expect(duvalZone(60, 36, 4)).toBe("DT"); // 4% acetylene leaves the thermal zones
    expect(duvalZone(64, 23, 13)).toBe("D2");
  });

  /** Ray casting: is (x, y) inside the polygon? */
  const inside = (x: number, y: number, poly: readonly (readonly [number, number])[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  it("draws every zone exactly where it classifies", () => {
    // Every point on a fine grid inside the triangle lies in exactly one drawn zone, and it's
    // the zone duvalZone() names. (Points a hair off the grid avoid sitting on a boundary.)
    for (let c2h4 = 0.37; c2h4 < 100; c2h4 += 1.3) {
      for (let c2h2 = 0.29; c2h4 + c2h2 < 100; c2h2 += 1.3) {
        const zones = DuvalZone.options.filter((z) => inside(c2h4, c2h2, DUVAL_ZONE_SHAPES[z]));
        expect(zones, `${c2h4}, ${c2h2}`).toEqual([duvalZone(100 - c2h4 - c2h2, c2h4, c2h2)]);
      }
    }
  });
});

describe("IEEE C57.104 conditions", () => {
  it("steps up at each limit", () => {
    const h2 = DGA_CONDITION_LIMITS.H2;
    expect(dgaCondition(45, h2)).toBe(1);
    expect(dgaCondition(100, h2)).toBe(1);
    expect(dgaCondition(101, h2)).toBe(2);
    expect(dgaCondition(1000, h2)).toBe(3);
    expect(dgaCondition(2000, h2)).toBe(4);
    expect(dgaCondition(2, DGA_CONDITION_LIMITS.C2H2)).toBe(2); // any acetylene above 1 ppm is worth a look
  });
});
