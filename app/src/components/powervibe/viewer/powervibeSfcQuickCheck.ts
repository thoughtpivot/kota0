import { parse as parseSfc } from "@vue/compiler-sfc";

/** True when `source` parses as a valid Vue SFC (same check as PowerVibe PUT). */
export function isValidPowervibeAppSfc(source: string): boolean {
  const { errors } = parseSfc(source, { filename: "App.vue" });
  return errors.length === 0;
}
