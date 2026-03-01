// src/core/util/sleep.mjs
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
