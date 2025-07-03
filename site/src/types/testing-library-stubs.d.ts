declare module "@testing-library/react" {
  // Minimal stub covering the utilities we actually use in tests.
  export const screen: any;
  export function waitFor<T = any>(
    callback: () => Promise<T> | T,
    options?: any,
  ): Promise<T>;
  export function render(...args: any[]): any;
}

declare module "@testing-library/user-event" {
  const userEvent: any;
  export default userEvent;
}
