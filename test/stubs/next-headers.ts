// Test stub for next/headers — enough for modules to import cleanly.
export function cookies() {
  return {
    get: () => undefined,
    set: () => {},
    delete: () => {},
  };
}

export function headers() {
  return new Map<string, string>();
}
