declare module "@jest/globals" {
  // use the global jest namespace declared by @types/jest
  export const describe: typeof globalThis.describe;
  export const it: typeof globalThis.it;
  export const test: typeof globalThis.test;
  export const expect: typeof globalThis.expect;
  export const beforeAll: typeof globalThis.beforeAll;
  export const beforeEach: typeof globalThis.beforeEach;
  export const afterAll: typeof globalThis.afterAll;
  export const afterEach: typeof globalThis.afterEach;
  export const jest: typeof globalThis.jest;
}
