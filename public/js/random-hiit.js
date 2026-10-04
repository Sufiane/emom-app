export function maxBursts({ totalSec, minRestSec, burstMinSec }) {
  return Math.floor((totalSec - minRestSec) / (burstMinSec + minRestSec));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec }) {
  if (![totalSec, minRestSec, burstMinSec, burstMaxSec].every(isPositiveInteger)) {
    return 'config_invalid';
  }

  if (burstMinSec > burstMaxSec) {
    return 'burst_range_invalid';
  }

  if (maxBursts({ totalSec, minRestSec, burstMinSec }) < 1) {
    return 'total_too_short';
  }

  return null;
}

function randomInt(random, maxInclusive) {
  return Math.floor(random() * (maxInclusive + 1));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function generateBurstSchedule({ totalSec, minRestSec, burstMinSec, burstMaxSec, random = Math.random }) {
  const error = validateRandomConfig({ totalSec, minRestSec, burstMinSec, burstMaxSec });

  if (error != null) {
    throw new Error(error);
  }

  const most = maxBursts({ totalSec, minRestSec, burstMinSec });
  const fewest = Math.max(1, Math.ceil(most / 2));
  const count = fewest + randomInt(random, most - fewest);
  const free = totalSec - (count + 1) * minRestSec - count * burstMinSec;

  const extras = [];

  for (let i = 0; i < count; i++) {
    extras.push(randomInt(random, burstMaxSec - burstMinSec));
  }

  const extraTotal = sum(extras);
  const fitted = extraTotal > free
    ? extras.map((extra) => Math.floor((extra * free) / extraTotal))
    : extras;
  const slack = free - sum(fitted);

  const cuts = [];

  for (let i = 0; i < count; i++) {
    cuts.push(randomInt(random, slack));
  }

  cuts.sort((left, right) => left - right);

  const bursts = [];
  let cursor = 0;
  let previousCut = 0;

  for (let i = 0; i < count; i++) {
    cursor += minRestSec + (cuts[i] - previousCut);
    previousCut = cuts[i];

    const duration = burstMinSec + fitted[i];

    bursts.push({ start: cursor, end: cursor + duration });
    cursor += duration;
  }

  return bursts;
}

export function segmentsFromBursts(bursts, totalSec, offset) {
  const segments = [];
  let cursor = 0;
  let round = 0;

  for (const burst of bursts) {
    segments.push({ kind: 'rest', round, start: offset + cursor, end: offset + burst.start });
    round += 1;
    segments.push({ kind: 'work', round, start: offset + burst.start, end: offset + burst.end });
    cursor = burst.end;
  }

  segments.push({ kind: 'rest', round, start: offset + cursor, end: offset + totalSec });

  return segments;
}
