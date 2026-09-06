/** SQLite LOWER handles ASCII; normalize Turkish uppercase letters explicitly before comparing. */
export function searchableSql(expression: string) {
  for (const [upper, lower] of [["İ", "i"], ["I", "ı"], ["Ç", "ç"], ["Ğ", "ğ"], ["Ö", "ö"], ["Ş", "ş"], ["Ü", "ü"]]) expression = `REPLACE(${expression}, '${upper}', '${lower}')`;
  return `LOWER(${expression})`;
}

export function searchPattern(query: string) {
  return `%${query.normalize("NFC").toLocaleLowerCase("tr-TR").replace(/[\\%_]/g, "\\$&")}%`;
}
