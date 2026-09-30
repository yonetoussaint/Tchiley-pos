export const USE_MOCK_SALES = true;
export const MOCK_HISTORY_DAYS = 120;

export function makeMockRand(seedStart: number) {
  let seed = seedStart;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const roundTo = (value: number, step: number) => Math.round(value / step) * step;
  return { rand, randInt, roundTo };
}

export function mockDateAt(daysAgo: number, hour: number, minute: number): Date {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
  return date.getTime() > now.getTime() ? new Date(now.getTime() - 60000) : date;
}
