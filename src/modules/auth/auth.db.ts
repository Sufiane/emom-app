export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
};

export class AuthDb {
  constructor(private db: D1Database) {}

  findByEmail(email: string): Promise<UserRow | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<UserRow>();
  }

  findById(id: string): Promise<UserRow | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
  }

  async insert(row: UserRow): Promise<void> {
    await this.db
      .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(row.id, row.email, row.password_hash, row.created_at)
      .run();
  }
}
