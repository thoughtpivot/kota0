import { parse as parseSfc } from "@vue/compiler-sfc";

/** True when `source` parses as a valid Vue SFC (same check as Kota0 PUT). */
export function isValidKota0AppSfc(source: string): boolean {
  const { errors } = parseSfc(source, { filename: "App.vue" });
  return errors.length === 0;
}
