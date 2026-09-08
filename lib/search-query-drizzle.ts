import { sql, type SQLWrapper } from "drizzle-orm";
import { searchNeedle } from "./search-query";

/** Keep identifiers typed and the complete literal query bound by Drizzle. */
export function searchContainsDrizzle(expression: SQLWrapper, query: string) {
  return sql<boolean>`INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${expression}, 'İ', 'i'), 'I', 'ı'), 'Ç', 'ç'), 'Ğ', 'ğ'), 'Ö', 'ö'), 'Ş', 'ş'), 'Ü', 'ü')), ${searchNeedle(query)}) > 0`;
}
