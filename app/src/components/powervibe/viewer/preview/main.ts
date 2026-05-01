import "./chartJsSetup";
import { initShikiChatMarkdown } from "@/lib/renderChatMarkdown";
import { createApp } from "vue";
import GeneratedApp from "../generated/App.vue";
/** Tailwind + design tokens — same as `src/main.ts`. Without this, class utilities in generated `App.vue` have no rules in the preview document. */
import "@/style.css";
/** Utilities for classes used only in `viewer/generated/App.vue` (excluded from `@/style.css` for host stability). */
import "./powervibeGeneratedTailwind.css";

void initShikiChatMarkdown();
createApp(GeneratedApp).mount("#powervibe-preview-root");
