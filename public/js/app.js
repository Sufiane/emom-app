import { api } from './api.js';
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

function workoutTotalSeconds(workout) {
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
    authError.textContent = error.message;
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
  const summary = workout.type === 'intervals'
    ? `${workout.rounds} × (${workout.work_sec}s / ${workout.rest_sec}s) · ${formatClock(total)}`
    : `${workout.rounds} × ${workout.work_sec}s · ${formatClock(total)}`;
  const typeLabel = workout.type === 'intervals' ? 'Intervals' : 'EMOM';

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

const PRESETS = {
  tabata: { work: 20, rest: 10, rounds: 8, lead: 3 },
  hiit: { work: 30, rest: 15, rounds: 10, lead: 5 }
};

function setType(type) {
  currentType = type;

  for (const opt of document.querySelectorAll('.type-opt')) {
    opt.setAttribute('aria-selected', String(opt.dataset.type === type));
  }

  for (const group of document.querySelectorAll('.type-fields')) {
    group.classList.toggle('hidden', group.dataset.for !== type);
  }

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
  byId('w-lead-out').textContent = leadInput.value;
  leadInput.setAttribute('aria-valuetext', `${leadInput.value} seconds`);

  const rounds = Number(roundsInput.value) || 0;
  const total = currentType === 'intervals'
    ? rounds * ((Number(workInput.value) || 0) + (Number(restInput.value) || 0))
    : rounds * Number(intervalInput.value);

  byId('w-total').textContent = formatClock(total);
}

for (const input of [intervalInput, roundsInput, leadInput, workInput, restInput]) {
  input.addEventListener('input', updateFormDerived);
}

function openForm(workout) {
  editingId = workout ? workout.id : null;
  formError.textContent = '';
  byId('form-title').textContent = loggedIn ? (workout ? 'Edit workout' : 'New workout') : 'Quick workout';
  byId('form-submit').textContent = loggedIn ? 'Save' : 'Start';
  byId('form-cancel').classList.toggle('hidden', !loggedIn);

  const nameInput = byId('w-name');
  nameInput.required = loggedIn;
  nameInput.placeholder = loggedIn ? '' : 'Workout';
  nameInput.value = workout ? workout.name : '';

  const type = workout ? workout.type : 'emom';

  if (type === 'intervals') {
    workInput.value = String(workout ? workout.work_sec : 40);
    restInput.value = String(workout ? workout.rest_sec : 20);
  } else {
    intervalInput.value = String(workout ? workout.work_sec : 60);
  }

  roundsInput.value = String(workout ? workout.rounds : 10);
  leadInput.value = String(workout ? workout.warning_lead_sec : 10);

  setType(type);
  showView('form');
}

workoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

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

  try {
    if (editingId) {
      await api.updateWorkout(editingId, payload);
    } else {
      await api.createWorkout(payload);
    }

    await renderList();
    showView('list');
  } catch (error) {
    formError.textContent = error.message;
  }
});

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
  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    // Not supported outside standalone PWA, or on iOS — silently ignore.
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
  if (document.visibilityState === 'visible' && timer != null && !timer.paused && !timer.finished) {
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
  const typeLabel = workout.type === 'intervals' ? 'Intervals' : 'EMOM';
  const summary = `${typeLabel} · ${workout.rounds} rounds`;

  if (!loggedIn && workout.name === 'Workout') {
    return summary;
  }

  return `${workout.name} · ${summary}`;
}

function openRunner(workout) {
  stopTimer();
  byId('run-name').textContent = runnerHeading(workout);
  byId('run-time').textContent = formatClock(workout.work_sec);
  byId('run-rounds').textContent = phaseLabel(workout, 'work', 1);
  byId('run-total').textContent = `Total ${formatClock(workoutTotalSeconds(workout))}`;
  runnerSection.dataset.phase = 'work';
  startBtn.textContent = 'Start';
  startBtn.dataset.state = 'idle';
  startBtn.dataset.workout = JSON.stringify(workout);
  showView('runner');
  lockLandscape();
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

  byId('run-time').textContent = formatClock(state.remainingPhase);
  byId('run-rounds').textContent = phaseLabel(workout, state.phase, state.round);
  byId('run-total').textContent = `Total remaining ${formatClock(state.remainingTotal)}`;
  runnerSection.dataset.phase = state.phase;
}

function onRunFinish() {
  releaseWakeLock();
  startBtn.textContent = 'Done';
  startBtn.dataset.state = 'done';
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
  const state = startBtn.dataset.state;

  if (state === 'idle' || state === 'done') {
    const workout = JSON.parse(startBtn.dataset.workout);
    timer = new WorkoutTimer(workout, onRunUpdate, onRunFinish);
    timer.start();
    acquireWakeLock();
    startBtn.textContent = 'Pause';
    startBtn.dataset.state = 'running';
  } else if (state === 'running') {
    timer.pause();
    releaseWakeLock();
    startBtn.textContent = 'Resume';
    startBtn.dataset.state = 'paused';
  } else if (state === 'paused') {
    timer.resume();
    acquireWakeLock();
    startBtn.textContent = 'Pause';
    startBtn.dataset.state = 'running';
  }
});

byId('run-reset').addEventListener('click', () => {
  const workout = JSON.parse(startBtn.dataset.workout);
  openRunner(workout);
});

byId('run-back').addEventListener('click', () => {
  stopTimer();
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
    startBtn.click();
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
