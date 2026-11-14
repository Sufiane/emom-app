import { badRequest } from '../bad-request';
import type { Brand } from '../brand';

export type LayerSec = Brand<number, 'LayerSec'>;

const LAYER_MIN = 5;
const LAYER_MAX = 600;

export function makeLayerSec(value: unknown): LayerSec {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < LAYER_MIN || value > LAYER_MAX) {
    throw badRequest('work_out_of_range');
  }

  return value as LayerSec;
}
