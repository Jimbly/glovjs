
type RGBA = number; // In the 0xRRGGBBAA format

export interface FontStyleParam {
  color?: RGBA;
  outline_width?: number;
  outline_color?: RGBA;
  // Glow: can be used for a dropshadow as well
  //   inner can be negative to have the glow be less opaque (can also just change the alpha of the glow color)
  //   a glow would be e.g. (0, 0, -1, 5)
  //   a dropshadow would be e.g. (3.25, 3.25, -2.5, 5)
  glow_xoffs?: number;
  glow_yoffs?: number;
  glow_inner?: number;
  glow_outer?: number;
  glow_color?: RGBA;
}

export type FontStyle = { _opaque: 'FontStyle' };

export function style(base: FontStyle | null, param: FontStyleParam): FontStyle;
export function styleAlpha(base: FontStyle | null, alpha: number): FontStyle;
export function styleColored(base: FontStyle | null, color: RGBA): FontStyle;

type AlignKey =
  'HLEFT' | 'HCENTER' | 'HRIGHT' | 'HMASK' |
  'VTOP' | 'VCENTER' | 'VBOTTOM' | 'VMASK' |
  'HFIT' | 'HWRAP' |
  'HCENTERFIT' | 'HRIGHTFIT' | 'HVCENTER' | 'HVCENTERFIT';

export const ALIGN: Record<AlignKey, number>;
