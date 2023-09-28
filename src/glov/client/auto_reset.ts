import { TSMap } from 'glov/common/types';
import * as engine from './engine';

let auto_reset_data: TSMap<number> = Object.create(null);
export function autoReset(key: string): boolean {
  let last_value: number | undefined = auto_reset_data[key];
  auto_reset_data[key] = engine.frame_index;
  return !(last_value! >= engine.frame_index - 1);
}
