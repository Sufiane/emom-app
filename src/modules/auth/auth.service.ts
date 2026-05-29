import { HTTPException } from 'hono/http-exception';
import { hashPassword, verifyPassword, randomId } from '../../lib/crypto';
import { AuthDb } from './auth.db';

export type PublicUser = {
  id: string;
  email: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  constructor(private db: AuthDb) {}

  async register(email: string, password: string): Promise<PublicUser> {
    const normalizedEmail = normalizeEmail(email);

    validateCredentials(normalizedEmail, password);

    const existing = await this.db.findByEmail(normalizedEmail);

    if (existing != null) {
      throw new HTTPException(409, { message: 'email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const user = {
      id: randomId(),
      email: normalizedEmail,
      password_hash: passwordHash,
      created_at: Date.now()
    };

    await this.db.insert(user);

    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string): Promise<PublicUser> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.db.findByEmail(normalizedEmail);

    if (user == null) {
      throw new HTTPException(401, { message: 'invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      throw new HTTPException(401, { message: 'invalid credentials' });
    }

    return { id: user.id, email: user.email };
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.db.findById(id);

    if (user == null) {
      throw new HTTPException(404, { message: 'user not found' });
    }

    return { id: user.id, email: user.email };
  }
}

function normalizeEmail(email: string): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validateCredentials(email: string, password: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new HTTPException(400, { message: 'invalid email' });
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HTTPException(400, { message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
}
