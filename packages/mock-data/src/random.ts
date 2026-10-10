/**
 * Deterministic randomness.
 *
 * "Seeded" means: same seed in → same numbers out, every time, on every computer.
 * That makes demos repeatable and tests reliable. Nothing in the mock may use Math.random().
 */

/** Turns a string into a 32-bit number (FNV-1a hash). Used to derive seeds from names. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mixes two integers into one well-scrambled 32-bit number. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ (b | 0);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A repeatable "random" number in [0, 1) for position `n` of stream `seed`. No state needed. */
export function hashNoise(seed: number, n: number): number {
  return hash2(seed, n) / 4294967296;
}

/** Like hashNoise but bell-shaped (standard normal: mean 0, standard deviation 1). Box–Muller transform. */
export function gaussNoise(seed: number, n: number): number {
  const u1 = (hash2(seed, n) + 1) / 4294967297;
  const u2 = hash2(seed ^ 0x5bd1e995, n) / 4294967296;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Smooth, slowly wandering noise in [-1, 1]: random values at every `periodSeconds`,
 * blended with a cosine curve in between. Used for clouds, load swings, sensor drift.
 */
export function smoothNoise(seed: number, tSeconds: number, periodSeconds: number): number {
  const x = tSeconds / periodSeconds;
  const i = Math.floor(x);
  const f = x - i;
  const a = hashNoise(seed, i) * 2 - 1;
  const b = hashNoise(seed, i + 1) * 2 - 1;
  const blend = (1 - Math.cos(Math.PI * f)) / 2;
  return a + (b - a) * blend;
}

/**
 * A stream of random numbers (mulberry32 algorithm).
 * Use `Rng.for(seed, "topic")` so each topic (sites, faults, users…) gets its own
 * stream — adding an asset then doesn't reshuffle the people.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  static for(seed: number, topic: string): Rng {
    return new Rng(hash2(seed, hashString(topic)));
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Whole number from min to max, both included. */
  int(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty list");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks using weights: weighted([["a", 3], ["b", 1]]) returns "a" three times as often. */
  weighted<T>(options: readonly (readonly [T, number])[]): T {
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of options) {
      roll -= weight;
      if (roll < 0) return value;
    }
    const last = options[options.length - 1];
    if (!last) throw new Error("Rng.weighted: empty list");
    return last[0];
  }
}
