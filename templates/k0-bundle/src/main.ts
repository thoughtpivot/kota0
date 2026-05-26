// Error bridge installs first so any subsequent failure (chart setup, App.vue
// import) gets captured and POSTed back to the workspace agent loop.
import "./errorBridge";
import "./chartJsSetup";
import { createApp } from "vue";
import App from "../App.vue";
import "@/style.css";

createApp(App).mount("#kota0-preview-root");
