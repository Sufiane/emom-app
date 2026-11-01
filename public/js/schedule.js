export function intervalTotalSeconds({ rounds, work_sec, rest_sec }) {
  return rounds * work_sec + Math.max(0, rounds - 1) * (rest_sec || 0);
}

export function workoutTotalSeconds(workout) {
  if (workout.type === 'random') {
    return workout.total_sec;
  }

  return intervalTotalSeconds(workout);
}
