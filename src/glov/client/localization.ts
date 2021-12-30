export interface LocalizableString {
  toLocalString(): string;
}

export function getStringFromLocalizable(s: string | LocalizableString): string {
  return s && (s as LocalizableString).toLocalString ?
    (s as LocalizableString).toLocalString() :
    (s as string);
}
