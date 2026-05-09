import type { Plugin } from "vite";
import { sanitizeKota0AppSfcForTailwindVite } from "./src/components/kota0/viewer/kota0SfcTailwindSanitize";

/** Resolved module id suffix for the materialized generated preview SFC. */
const K0_GENERATED_APP_SUFFIX = "components/kota0/viewer/generated/App.vue";

function isKota0GeneratedAppRootId(id: string): boolean {
  if (id.includes("?")) return false;
  const clean = id.replace(/\\/g, "/");
  return clean.endsWith(K0_GENERATED_APP_SUFFIX);
}

/** Runs before Vue/Tailwind so `selection:` inside `@apply` never hits @tailwindcss/vite. */
export function kota0GeneratedSfcSanitizePlugin(): Plugin {
  return {
    name: "kota0-sanitize-generated-app",
    enforce: "pre",
    transform(code, id) {
      if (!isKota0GeneratedAppRootId(id)) return null;
      if (!code.includes("@apply") && !/(?:^|\s)(?:dark:)?selection:/.test(code)) {
        return null;
      }
      return sanitizeKota0AppSfcForTailwindVite(code);
    },
  };
}
