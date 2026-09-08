/** SQLite LOWER handles ASCII; normalize Turkish uppercase letters explicitly before comparing. */
export function searchableSql(expression: string) {
  for (const [upper, lower] of [["İ", "i"], ["I", "ı"], ["Ç", "ç"], ["Ğ", "ğ"], ["Ö", "ö"], ["Ş", "ş"], ["Ü", "ü"]]) expression = `REPLACE(${expression}, '${upper}', '${lower}')`;
  return `LOWER(${expression})`;
}

/** Literal substring comparison avoids D1's 50-byte LIKE pattern limit. */
export function searchContainsSql(expression: string) {
  return `INSTR(${searchableSql(expression)}, ?) > 0`;
}

export function searchNeedle(query: string) {
  return query.normalize("NFC").toLocaleLowerCase("tr-TR");
}
