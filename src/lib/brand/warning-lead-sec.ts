import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type WarningLeadSec = Brand<number, 'WarningLeadSec'>;

const WARNING_LEAD_MIN = 3;
const WARNING_LEAD_MAX = 15;

export function makeWarningLeadSec(value: unknown): WarningLeadSec {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest('warning_lead_sec_not_integer');
  }

  if (value < WARNING_LEAD_MIN || value > WARNING_LEAD_MAX) {
    throw badRequest('warning_lead_sec_out_of_range');
  }

  return value as WarningLeadSec;
}
