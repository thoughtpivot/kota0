import type { Plugin } from "vite";
import { sanitizePowervibeAppSfcForTailwindVite } from "./src/components/powervibe/viewer/powervibeSfcTailwindSanitize";

/** Resolved module id suffix for the materialized generated preview SFC. */
const POWERVIBE_GENERATED_APP_SUFFIX = "components/powervibe/viewer/generated/App.vue";

function isPowervibeGeneratedAppRootId(id: string): boolean {
  if (id.includes("?")) return false;
  const clean = id.replace(/\\/g, "/");
  return clean.endsWith(POWERVIBE_GENERATED_APP_SUFFIX);
}

/** Runs before Vue/Tailwind so `selection:` inside `@apply` never hits @tailwindcss/vite. */
export function powervibeGeneratedSfcSanitizePlugin(): Plugin {
  return {
    name: "powervibe-sanitize-generated-app",
    enforce: "pre",
    transform(code, id) {
      if (!isPowervibeGeneratedAppRootId(id)) return null;
      if (!code.includes("@apply") && !/(?:^|\s)(?:dark:)?selection:/.test(code)) {
        return null;
      }
      return sanitizePowervibeAppSfcForTailwindVite(code);
    },
  };
}
