import { stepsOf } from './pyramids.js';

export function intervalTotalSeconds({ rounds, work_sec, rest_sec }) {
  return rounds * work_sec + Math.max(0, rounds - 1) * (rest_sec || 0);
}

export function pyramidTotalSeconds(workout) {
  const steps = stepsOf(workout);
  const work = steps.reduce((total, step) => total + step.work_sec, 0);
  const rest = steps.slice(0, -1).reduce((total, step) => total + step.rest_sec, 0);

  return work + rest;
}

export function workoutTotalSeconds(workout) {
  if (workout.type === 'random') {
    return workout.total_sec;
  }

  if (workout.type === 'pyramids') {
    return pyramidTotalSeconds(workout);
  }

  return intervalTotalSeconds(workout);
}

export function formatClock(totalSeconds) {
  const seconds = Math.ceil(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function formatTotalOrPlaceholder(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return '--:--';
  }

  return formatClock(totalSeconds);
}
