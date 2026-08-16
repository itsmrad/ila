declare module 'bun:test' {
  interface Matchers {
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBe(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toHaveLength(expected: number): void;
    not: Omit<Matchers, 'not'>;
  }

  export function describe(name: string, run: () => void): void;
  export function test(name: string, run: () => void | Promise<void>): void;
  export function expect(value: unknown): Matchers;
}
