import { DEFAULT_K0_BACKEND, DEFAULT_K0_SFC } from "@/components/kota0/viewer/materialize/materialize";

/** True when Scribe HEAD still matches the Kota0 starter greetings demo. */
export function isPlaceholder(args: { sfc: string; backend: string }): boolean {
  return args.sfc.trim() === DEFAULT_K0_SFC.trim() && args.backend.trim() === DEFAULT_K0_BACKEND.trim();
}
