import { api } from './api.js';
import { maxBursts, validateRandomConfig } from './random-hiit.js';
import { WorkoutTimer } from './timer.js';

const byId = (id) => document.getElementById(id);
const views = ['auth', 'list', 'form', 'runner'];
let loggedIn = false;

function showView(name) {
  for (const view of views) {
    byId(`view-${view}`).classList.toggle('hidden', view !== name);
  }

  document.body.dataset.view = name;
}

function applyChrome() {
  byId('logout-btn').classList.toggle('hidden', !loggedIn);
  byId('login-btn').classList.toggle('hidden', loggedIn);
  byId('guest-banner').classList.toggle('hidden', loggedIn);
  byId('learn').classList.toggle('hidden', loggedIn);
}

function formatClock(totalSeconds) {
  const seconds = Math.ceil(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

const TYPE_LABELS = { emom: 'EMOM', intervals: 'Intervals', random: 'Random HIIT' };

function workoutTotalSeconds(workout) {
  if (workout.type === 'random') {
    return workout.total_sec;
  }

  return workout.rounds * (workout.work_sec + (workout.rest_sec || 0));
}

// ---- Auth ----

const authForm = byId('auth-form');
const authError = byId('auth-error');

async function handleAuth(action) {
  authError.textContent = '';

  const email = byId('auth-email').value.trim();
  const password = byId('auth-password').value;

  try {
    await action(email, password);
    await enterApp();
  } catch (error) {
    authError.textContent = errorMessage(error.message);
  }
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuth(api.login);
});

byId('register-btn').addEventListener('click', () => {
  if (authForm.reportValidity()) {
    handleAuth(api.register);
  }
});

byId('logout-btn').addEventListener('click', async () => {
  await api.logout();
  showGuestHome();
});

byId('login-btn').addEventListener('click', () => showView('auth'));
byId('banner-login').addEventListener('click', () => showView('auth'));
byId('guest-link').addEventListener('click', () => showGuestHome());

// ---- Workout list ----

async function renderList() {
  const { workouts } = await api.listWorkouts();
  const list = byId('workout-list');

  list.innerHTML = '';
  byId('list-empty').classList.toggle('hidden', workouts.length > 0);

  for (const workout of workouts) {
    list.appendChild(workoutItem(workout));
  }
}

function workoutItem(workout) {
  const total = workoutTotalSeconds(workout);
  const typeLabel = TYPE_LABELS[workout.type] ?? 'EMOM';
  let summary;

  if (workout.type === 'random') {
    summary = `${formatClock(total)} · bursts ${workout.burst_min_sec}-${workout.burst_max_sec}s · rest ≥ ${workout.min_rest_sec}s`;
  } else if (workout.type === 'intervals') {
    summary = `${workout.rounds} × (${workout.work_sec}s / ${workout.rest_sec}s) · ${formatClock(total)}`;
  } else {
    summary = `${workout.rounds} × ${workout.work_sec}s · ${formatClock(total)}`;
  }

  const item = document.createElement('li');
  const info = document.createElement('div');

  info.innerHTML = `<strong>${escapeHtml(workout.name)}</strong>` +
    `<span class="muted"> · ${typeLabel} · ${summary}</span>`;

  const actions = document.createElement('div');
  actions.className = 'row';
  actions.append(
    button('Run', () => openRunner(workout)),
    button('Edit', () => openForm(workout), 'secondary'),
    button('Delete', () => removeWorkout(workout.id), 'danger')
  );

  item.append(info, actions);

  return item;
}

function button(label, onClick, variant) {
  const element = document.createElement('button');
  element.textContent = label;

  if (variant) {
    element.className = variant;
  }

  element.addEventListener('click', onClick);

  return element;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;

  return div.innerHTML;
}

async function removeWorkout(id) {
  if (window.confirm('Delete this workout?')) {
    await api.deleteWorkout(id);
    await renderList();
  }
}

byId('new-btn').addEventListener('click', () => openForm(null));

// ---- Form ----

const workoutForm = byId('workout-form');
const formError = byId('form-error');
let editingId = null;
let currentType = 'emom';

const intervalInput = byId('w-interval');
const roundsInput = byId('w-rounds');
const leadInput = byId('w-lead');
const workInput = byId('w-work');
const restInput = byId('w-rest');
const totalMinInput = byId('w-total-min');
const minRestInput = byId('w-min-rest');
const burstMinInput = byId('w-burst-min');
const burstMaxInput = byId('w-burst-max');

function randomConfig() {
  return {
    total_sec: Math.round(Number(totalMinInput.value) * 60),
    min_rest_sec: Number(minRestInput.value),
    burst_min_sec: Number(burstMinInput.value),
    burst_max_sec: Number(burstMaxInput.value)
  };
}

function randomEngineConfig(config) {
  return {
    totalSec: config.total_sec,
    minRestSec: config.min_rest_sec,
    burstMinSec: config.burst_min_sec,
    burstMaxSec: config.burst_max_sec
  };
}

const ERROR_MESSAGES = {
  name_required: 'Enter a workout name',
  name_too_long: 'Workout name is too long',
  type_invalid: 'Choose a valid workout type',
  rounds_not_integer: 'Rounds must be a whole number',
  rounds_out_of_range: 'Rounds must be between 1 and 120',
  warning_lead_sec_not_integer: 'Warning lead must be a whole number of seconds',
  warning_lead_sec_out_of_range: 'Warning lead must be between 3 and 15 seconds',
  work_sec_not_integer: 'Work time must be a whole number of seconds',
  work_sec_interval_not_allowed: 'EMOM interval must be 30, 60, 90 or 120 seconds',
  work_sec_out_of_range: 'Work time must be between 5 and 600 seconds',
  rest_sec_not_integer: 'Rest time must be a whole number of seconds',
  rest_sec_out_of_range: 'Rest time must be between 1 and 600 seconds',
  rest_sec_must_be_zero: 'Rest must be zero for this workout type',
  warning_lead_too_long: 'Warning lead must be shorter than both work and rest',
  total_sec_not_integer: 'Total time must be a whole number',
  total_sec_out_of_range: 'Total time must be between 1 and 60 minutes',
  min_rest_sec_not_integer: 'Minimum rest must be a whole number of seconds',
  min_rest_sec_out_of_range: 'Minimum rest must be between 5 and 120 seconds',
  burst_min_sec_not_integer: 'Shortest burst must be a whole number of seconds',
  burst_min_sec_out_of_range: 'Shortest burst must be between 5 and 120 seconds',
  burst_max_sec_not_integer: 'Longest burst must be a whole number of seconds',
  burst_max_sec_out_of_range: 'Longest burst must be between 5 and 120 seconds',
  burst_min_exceeds_max: 'Shortest burst must not exceed longest burst',
  burst_range_invalid: 'Shortest burst must not exceed longest burst',
  config_invalid: 'Enter whole numbers above zero in every field',
  workout_id_invalid: 'Invalid workout',
  workout_not_found: 'Workout not found',
  email_invalid: 'Enter a valid email address'
};

function errorMessage(code) {
  return ERROR_MESSAGES[code] ?? code;
}

function randomErrorMessage(code, config) {
  if (code === 'total_sec_too_short') {
    return `Total too short: need at least ${config.burst_min_sec + 2 * config.min_rest_sec}s`;
  }

  return errorMessage(code);
}

const PRESETS = {
  tabata: { work: 20, rest: 10, rounds: 8, lead: 3 },
  hiit: { work: 30, rest: 15, rounds: 10, lead: 5 }
};

function setSectionActive(section, active) {
  section.classList.toggle('hidden', !active);

  for (const control of section.querySelectorAll('input, select, button')) {
    control.disabled = !active;
  }
}

function setType(type) {
  currentType = type;

  for (const opt of document.querySelectorAll('.type-opt')) {
    opt.setAttribute('aria-selected', String(opt.dataset.type === type));
  }

  for (const group of document.querySelectorAll('.type-fields')) {
    setSectionActive(group, group.dataset.for === type);
  }

  for (const element of document.querySelectorAll('[data-except]')) {
    setSectionActive(element, element.dataset.except !== type);
  }

  byId('form-submit').textContent = loggedIn ? 'Save' : 'Start';
  byId('w-name').required = loggedIn;

  updateFormDerived();
}

for (const opt of document.querySelectorAll('.type-opt')) {
  opt.addEventListener('click', () => setType(opt.dataset.type));
}

for (const presetBtn of document.querySelectorAll('[data-preset]')) {
  presetBtn.addEventListener('click', () => {
    const preset = PRESETS[presetBtn.dataset.preset];

    if (preset == null) {
      return;
    }

    workInput.value = String(preset.work);
    restInput.value = String(preset.rest);
    roundsInput.value = String(preset.rounds);
    leadInput.value = String(preset.lead);
    updateFormDerived();
  });
}

function updateFormDerived() {
  const config = randomEngineConfig(randomConfig());

  byId('w-bursts').textContent = validateRandomConfig(config) == null ? String(maxBursts(config)) : '0';

  byId('w-lead-out').textContent = leadInput.value;
  leadInput.setAttribute('aria-valuetext', `${leadInput.value} seconds`);

  const rounds = Number(roundsInput.value) || 0;
  const total = currentType === 'intervals'
    ? rounds * ((Number(workInput.value) || 0) + (Number(restInput.value) || 0))
    : rounds * Number(intervalInput.value);

  byId('w-total').textContent = formatClock(total);
}

for (const input of [intervalInput, roundsInput, leadInput, workInput, restInput, totalMinInput, minRestInput, burstMinInput, burstMaxInput]) {
  input.addEventListener('input', updateFormDerived);
}

function openForm(workout) {
  editingId = workout ? workout.id : null;
  formError.textContent = '';
  byId('form-title').textContent = loggedIn ? (workout ? 'Edit workout' : 'New workout') : 'Quick workout';
  byId('form-cancel').classList.toggle('hidden', !loggedIn);

  const nameInput = byId('w-name');
  nameInput.placeholder = loggedIn ? '' : 'Workout';
  nameInput.value = workout ? workout.name : '';

  const type = workout ? workout.type : 'emom';

  const timed = workout != null && type !== 'random';

  if (type === 'intervals') {
    workInput.value = String(timed ? workout.work_sec : 40);
    restInput.value = String(timed ? workout.rest_sec : 20);
  } else {
    intervalInput.value = String(timed ? workout.work_sec : 60);
  }

  roundsInput.value = String(timed ? workout.rounds : 10);
  leadInput.value = String(timed ? workout.warning_lead_sec : 10);

  const saved = workout != null && type === 'random';

  totalMinInput.value = String(saved ? workout.total_sec / 60 : 2);
  minRestInput.value = String(saved ? workout.min_rest_sec : 15);
  burstMinInput.value = String(saved ? workout.burst_min_sec : 15);
  burstMaxInput.value = String(saved ? workout.burst_max_sec : 30);

  setType(type);
  showView('form');
}

workoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

  if (currentType === 'random') {
    const config = randomConfig();
    const code = validateRandomConfig(randomEngineConfig(config));

    if (code != null) {
      formError.textContent = randomErrorMessage(code, config);

      return;
    }

    const randomName = byId('w-name').value.trim();

    if (!loggedIn) {
      openRunner({ name: randomName || 'Workout', type: 'random', ...config });

      return;
    }

    await saveWorkout({ name: randomName, type: 'random', ...config });

    return;
  }

  const rounds = Number(roundsInput.value);
  const warningLead = Number(leadInput.value);
  const name = byId('w-name').value.trim();
  const payload = currentType === 'intervals'
    ? {
      name,
      type: 'intervals',
      rounds,
      work_sec: Number(workInput.value),
      rest_sec: Number(restInput.value),
      warning_lead_sec: warningLead
    }
    : {
      name,
      type: 'emom',
      rounds,
      work_sec: Number(intervalInput.value),
      rest_sec: 0,
      warning_lead_sec: warningLead
    };

  if (!loggedIn) {
    if (payload.name.length === 0) {
      payload.name = 'Workout';
    }

    openRunner(payload);

    return;
  }

  await saveWorkout(payload);
});

async function saveWorkout(payload) {
  try {
    if (editingId) {
      await api.updateWorkout(editingId, payload);
    } else {
      await api.createWorkout(payload);
    }

    await renderList();
    showView('list');
  } catch (error) {
    formError.textContent = errorMessage(error.message);
  }
}

byId('form-cancel').addEventListener('click', () => showView('list'));

// ---- Runner ----

let timer = null;
const startBtn = byId('run-start');
const runnerSection = byId('view-runner');

let wakeLock = null;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock != null) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

async function lockLandscape() {
  if (!screen.orientation?.lock) return false;
  try {
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Ignore.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || timer == null || timer.finished) {
    return;
  }

  // Mobile browsers auto-suspend the AudioContext while backgrounded.
  // If the user hadn't actually paused, kick audio back on and re-grab
  // the screen wake lock now that the page is foregrounded again.
  if (runnerSection.dataset.state === 'running') {
    timer.resume();
    acquireWakeLock();
  }
});

function phaseLabel(workout, phase, round) {
  if (workout.type === 'intervals') {
    const tag = phase === 'rest' ? 'REST' : 'WORK';

    return `${tag} · Round ${round} / ${workout.rounds}`;
  }

  return `Round ${round} / ${workout.rounds}`;
}

function runnerHeading(workout) {
  const summary = workout.type === 'random'
    ? `Random HIIT · ${formatClock(workout.total_sec)} · bursts ${workout.burst_min_sec}-${workout.burst_max_sec}s`
    : `${TYPE_LABELS[workout.type] ?? 'EMOM'} · ${workout.rounds} rounds`;

  if (!loggedIn && workout.name === 'Workout') {
    return summary;
  }

  return `${workout.name} · ${summary}`;
}

async function openRunner(workout) {
  stopTimer();
  byId('run-name').textContent = runnerHeading(workout);
  byId('run-time').textContent = formatClock(workout.type === 'random' ? workout.total_sec : workout.work_sec);
  byId('run-rounds').textContent = workout.type === 'random' ? 'Ready' : phaseLabel(workout, 'work', 1);
  byId('run-total').textContent = `Total ${formatClock(workoutTotalSeconds(workout))}`;
  runnerSection.dataset.phase = 'work';
  runnerSection.dataset.state = 'idle';
  startBtn.textContent = 'Start';
  startBtn.dataset.workout = JSON.stringify(workout);
  const resetBtn = byId('run-reset');
  resetBtn.dataset.confirm = 'false';
  resetBtn.textContent = 'Reset';
  showView('runner');
  const locked = await lockLandscape();
  byId('run-rotate').classList.toggle('hidden', locked);
}

function renderRandomUpdate(state) {
  runnerSection.dataset.phase = state.phase;

  if (state.phase === 'rest') {
    byId('run-time').textContent = formatClock(state.remainingTotal);
    byId('run-rounds').textContent = 'REST';
    byId('run-total').textContent = '';

    return;
  }

  byId('run-time').textContent = formatClock(state.remainingPhase);
  byId('run-rounds').textContent = `GO · Burst ${state.round}`;
  byId('run-total').textContent = `Total remaining ${formatClock(state.remainingTotal)}`;
}

function onRunUpdate(state) {
  if (state.phase === 'countdown') {
    byId('run-time').textContent = String(state.count);
    byId('run-rounds').textContent = 'Get ready';
    byId('run-total').textContent = '';
    runnerSection.dataset.phase = 'countdown';

    return;
  }

  const workout = JSON.parse(startBtn.dataset.workout);

  if (workout.type === 'random') {
    renderRandomUpdate(state);

    return;
  }

  byId('run-time').textContent = formatClock(state.remainingPhase);
  byId('run-rounds').textContent = phaseLabel(workout, state.phase, state.round);
  byId('run-total').textContent = `Total remaining ${formatClock(state.remainingTotal)}`;
  runnerSection.dataset.phase = state.phase;
}

function onRunFinish() {
  releaseWakeLock();
  startBtn.textContent = 'Run again';
  runnerSection.dataset.state = 'done';
  byId('run-rounds').textContent = 'Finished';

  if (!loggedIn) {
    byId('signup-modal').showModal();
  }
}

byId('modal-dismiss').addEventListener('click', () => {
  byId('signup-modal').close();
});

byId('modal-signup').addEventListener('click', () => {
  byId('signup-modal').close();
  stopTimer();
  showView('auth');
});

startBtn.addEventListener('click', () => {
  const state = runnerSection.dataset.state;

  if (state === 'idle' || state === 'done') {
    const workout = JSON.parse(startBtn.dataset.workout);
    timer = new WorkoutTimer(workout, onRunUpdate, onRunFinish);
    timer.start();
    acquireWakeLock();
    runnerSection.dataset.state = 'running';
  }
});

function togglePause() {
  const state = runnerSection.dataset.state;

  if (state === 'running' && timer != null) {
    timer.pause();
    releaseWakeLock();
    runnerSection.dataset.state = 'paused';
  } else if (state === 'paused' && timer != null) {
    timer.resume();
    acquireWakeLock();
    runnerSection.dataset.state = 'running';
  }
}

byId('run-time').addEventListener('click', togglePause);
byId('run-time').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    togglePause();
  }
});

let resetConfirmTimer = null;

byId('run-reset').addEventListener('click', () => {
  const btn = byId('run-reset');

  if (btn.dataset.confirm === 'true') {
    clearTimeout(resetConfirmTimer);
    btn.dataset.confirm = 'false';
    btn.textContent = 'Reset';
    const workout = JSON.parse(startBtn.dataset.workout);
    openRunner(workout);
  } else {
    btn.dataset.confirm = 'true';
    btn.textContent = 'Sure?';
    resetConfirmTimer = setTimeout(() => {
      btn.dataset.confirm = 'false';
      btn.textContent = 'Reset';
    }, 3000);
  }
});

byId('run-rotate').addEventListener('click', () => {
  document.body.classList.toggle('landscape-rotate');
});

byId('run-back').addEventListener('click', () => {
  stopTimer();
  document.body.classList.remove('landscape-rotate');
  unlockOrientation();

  if (loggedIn) {
    showView('list');
  } else {
    showView('form');
  }
});

// Runner keyboard shortcuts. Space = pause/resume, Esc = back, R = reset.
// Suppressed when an input control is focused.
document.addEventListener('keydown', (event) => {
  if (document.body.dataset.view !== 'runner') {
    return;
  }

  const tag = event.target.tagName;

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return;
  }

  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault();
    const state = runnerSection.dataset.state;

    if (state === 'running' || state === 'paused') {
      togglePause();
    } else {
      startBtn.click();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    byId('run-back').click();
  } else if (event.key === 'r' || event.key === 'R') {
    event.preventDefault();
    byId('run-reset').click();
  }
});

function stopTimer() {
  releaseWakeLock();

  if (timer != null) {
    timer.stop();
    timer = null;
  }
}

// ---- Bootstrap ----

async function enterApp() {
  loggedIn = true;
  applyChrome();
  await renderList();
  showView('list');
}

function showGuestHome() {
  loggedIn = false;
  applyChrome();
  openForm(null);
}

async function boot() {
  try {
    await api.me();
    await enterApp();
  } catch {
    showGuestHome();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
