/**
 * Home / command-center only — helpers and one-time Chart.js setup for `Home.vue`.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";

/** Registers modules for Doughnut (status) + Bar (activity) via vue-chartjs. Call once before charts mount. */
export function registerHomeChartJs(): void {
  ChartJS.register(
    ArcElement,
    DoughnutController,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
  );
}
