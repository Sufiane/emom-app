async function request(method, path, body) {
  const options = {
    method,
    credentials: 'include',
    headers: {}
  };

  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data.error || 'request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  register: (email, password) => request('POST', '/api/auth/register', { email, password }),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  listWorkouts: () => request('GET', '/api/workouts'),
  createWorkout: (workout) => request('POST', '/api/workouts', workout),
  updateWorkout: (id, workout) => request('PUT', `/api/workouts/${id}`, workout),
  deleteWorkout: (id) => request('DELETE', `/api/workouts/${id}`)
};
