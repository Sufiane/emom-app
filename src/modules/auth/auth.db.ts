import type { Email } from '../../lib/brand/email';
import type { PasswordHash } from '../../lib/brand/password-hash';
import type { UnixMs } from '../../lib/brand/unix-ms';
import type { UserId } from '../../lib/brand/user-id';

export type UserRow = {
  id: UserId;
  email: Email;
  password_hash: PasswordHash;
  created_at: UnixMs;
};

export class AuthDb {
  constructor(private db: D1Database) {}

  findByEmail(email: Email): Promise<UserRow | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<UserRow>();
  }

  findById(id: UserId): Promise<UserRow | null> {
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
