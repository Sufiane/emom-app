import { HTTPException } from 'hono/http-exception';
import type { Brand } from '../brand';

export type WarningLeadSec = Brand<number, 'WarningLeadSec'>;

const WARNING_LEAD_MIN = 3;
const WARNING_LEAD_MAX = 15;

export function makeWarningLeadSec(value: unknown): WarningLeadSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HTTPException(400, { message: 'warning_lead_sec must be an integer' });
  }

  if (value < WARNING_LEAD_MIN || value > WARNING_LEAD_MAX) {
    throw new HTTPException(400, {
      message: `warning_lead_sec must be between ${WARNING_LEAD_MIN} and ${WARNING_LEAD_MAX}`
    });
  }

  return value as WarningLeadSec;
}
