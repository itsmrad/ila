declare module 'bun:test' {
  export function describe(name: string, run: () => void): void;
  export function test(name: string, run: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBe(expected: unknown): void;
    not: { toContain(expected: unknown): void };
  };
}
