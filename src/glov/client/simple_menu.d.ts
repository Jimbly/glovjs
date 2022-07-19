import { MenuItem, SelectionBoxParams } from './selection_box';

export interface SimpleMenu {
  run(params?: Partial<SelectionBoxParams>): number;
  isSelected(): boolean | string;
  isSelected(tag_or_index?: number | string): boolean;

  getSelectedIndex(): number;
  getSelectedItem(): MenuItem;
}

export function simpleMenuCreate(params?: Partial<SelectionBoxParams>): SimpleMenu;
