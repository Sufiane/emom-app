import { HTTPException } from 'hono/http-exception';
import { hashPassword, verifyPassword, randomId } from '../../lib/crypto';
import { makeEmail, type Email } from '../../lib/brand/email';
import { makePasswordHash } from '../../lib/brand/password-hash';
import { nowMs } from '../../lib/brand/unix-ms';
import { makeUserId, type UserId } from '../../lib/brand/user-id';
import { AuthDb } from './auth.db';

export type PublicUser = {
  id: UserId;
  email: Email;
};

const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  constructor(private db: AuthDb) {}

  async register(email: unknown, password: unknown): Promise<PublicUser> {
    const normalizedEmail = makeEmail(email);

    validatePassword(password);

    const existing = await this.db.findByEmail(normalizedEmail);

    if (existing != null) {
      throw new HTTPException(409, { message: 'email already registered' });
    }

    const passwordHash = makePasswordHash(await hashPassword(password as string));
    const user = {
      id: makeUserId(randomId()),
      email: normalizedEmail,
      password_hash: passwordHash,
      created_at: nowMs()
    };

    await this.db.insert(user);

    return { id: user.id, email: user.email };
  }

  async login(email: unknown, password: unknown): Promise<PublicUser> {
    const normalizedEmail = makeEmail(email);

    validatePassword(password);

    const user = await this.db.findByEmail(normalizedEmail);

    if (user == null) {
      throw new HTTPException(401, { message: 'invalid credentials' });
    }

    const valid = await verifyPassword(password as string, user.password_hash);

    if (!valid) {
      throw new HTTPException(401, { message: 'invalid credentials' });
    }

    return { id: user.id, email: user.email };
  }

  async getById(id: UserId): Promise<PublicUser> {
    const user = await this.db.findById(id);

    if (user == null) {
      throw new HTTPException(404, { message: 'user not found' });
    }

    return { id: user.id, email: user.email };
  }
}

function validatePassword(password: unknown): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HTTPException(400, { message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
}
