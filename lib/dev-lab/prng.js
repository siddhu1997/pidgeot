export function createSeededRandom(seed) {
  let current = seed >>> 0;

  return () => {
    current += 0x6d2b79f5;
    let next = current;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickItem(items, random) {
  return items[Math.floor(random() * items.length) % items.length];
}
