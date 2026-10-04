import { HTTPException } from 'hono/http-exception';

export function badRequest(code: string): HTTPException {
  return new HTTPException(400, { message: code });
}
