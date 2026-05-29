export type WorkoutRow = {
  id: string;
  user_id: string;
  name: string;
  total_duration_sec: number;
  interval_sec: number;
  warning_lead_sec: number;
  created_at: number;
  updated_at: number;
};

export class WorkoutsDb {
  constructor(private db: D1Database) {}

  async listByUser(userId: string): Promise<WorkoutRow[]> {
    const result = await this.db
      .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<WorkoutRow>();

    return result.results;
  }

  findById(id: string): Promise<WorkoutRow | null> {
    return this.db
      .prepare('SELECT * FROM workouts WHERE id = ?')
      .bind(id)
      .first<WorkoutRow>();
  }

  async insert(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO workouts (id, user_id, name, total_duration_sec, interval_sec, warning_lead_sec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        row.id,
        row.user_id,
        row.name,
        row.total_duration_sec,
        row.interval_sec,
        row.warning_lead_sec,
        row.created_at,
        row.updated_at
      )
      .run();
  }

  async update(row: WorkoutRow): Promise<void> {
    await this.db
      .prepare(
        'UPDATE workouts SET name = ?, total_duration_sec = ?, interval_sec = ?, warning_lead_sec = ?, updated_at = ? WHERE id = ?'
      )
      .bind(
        row.name,
        row.total_duration_sec,
        row.interval_sec,
        row.warning_lead_sec,
        row.updated_at,
        row.id
      )
      .run();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM workouts WHERE id = ?').bind(id).run();
  }
}
