import type { Plugin } from "vite";
import { sanitizeNvibeAppSfcForTailwindVite } from "./src/components/nvibe/viewer/nvibeSfcTailwindSanitize";

/** Resolved module id suffix for the materialized generated preview SFC. */
const NVIBE_GENERATED_APP_SUFFIX = "components/nvibe/viewer/generated/App.vue";

function isNvibeGeneratedAppRootId(id: string): boolean {
  if (id.includes("?")) return false;
  const clean = id.replace(/\\/g, "/");
  return clean.endsWith(NVIBE_GENERATED_APP_SUFFIX);
}

/** Runs before Vue/Tailwind so `selection:` inside `@apply` never hits @tailwindcss/vite. */
export function nvibeGeneratedSfcSanitizePlugin(): Plugin {
  return {
    name: "nvibe-sanitize-generated-app",
    enforce: "pre",
    transform(code, id) {
      if (!isNvibeGeneratedAppRootId(id)) return null;
      if (!code.includes("@apply") && !/(?:^|\s)(?:dark:)?selection:/.test(code)) {
        return null;
      }
      return sanitizeNvibeAppSfcForTailwindVite(code);
    },
  };
}
