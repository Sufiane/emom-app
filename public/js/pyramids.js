export const MIN_LAYERS = 3;
export const MIN_WORK_SEC = 5;
export const MAX_WORK_SEC = 600;
const HARD_REST_GAP_SEC = 5;

export function stepsOf({ mode, layers, rest_sec }) {
  const descent = layers.slice(0, -1).reverse();

  return [...layers, ...descent].map((work) => ({
    work_sec: work,
    rest_sec: mode === 'hard' ? rest_sec : work
  }));
}

function isAscending(layers) {
  return layers.every((layer, index) => index === 0 || layer > layers[index - 1]);
}

function isWorkInRange(work) {
  return Number.isInteger(work) && work >= MIN_WORK_SEC && work <= MAX_WORK_SEC;
}

function validateHardRest(workout) {
  if (!Number.isInteger(workout.rest_sec) || workout.rest_sec < 1) {
    return 'rest_out_of_range';
  }

  if (workout.rest_sec > workout.layers[0] - HARD_REST_GAP_SEC) {
    return 'rest_too_close_to_work';
  }

  return null;
}

export function validatePyramid(workout) {
  const { layers, mode, warning_lead_sec } = workout;

  if (layers.length < MIN_LAYERS) {
    return 'layers_too_few';
  }

  if (!layers.every(isWorkInRange)) {
    return 'work_out_of_range';
  }

  if (!isAscending(layers)) {
    return 'layers_not_ascending';
  }

  if (mode === 'hard') {
    const restError = validateHardRest(workout);

    if (restError != null) {
      return restError;
    }
  }

  const shortest = Math.min(...stepsOf(workout).flatMap((step) => [step.work_sec, step.rest_sec]));

  if (warning_lead_sec >= shortest) {
    return 'lead_too_long';
  }

  return null;
}
