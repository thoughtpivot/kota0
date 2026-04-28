/**
 * One-time Chart.js registration for the nVibe preview iframe.
 * `vue-chartjs` registers controllers per component, but scales/elements/plugins must exist too.
 * Generated `App.vue` can import `{ Line, Bar, Doughnut, … }` from `vue-chartjs` without re-registering.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PieController,
  PointElement,
  PolarAreaController,
  RadarController,
  RadialLinearScale,
  ScatterController,
  Title,
  Tooltip,
} from "chart.js";

ChartJS.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  BubbleController,
  DoughnutController,
  LineController,
  PieController,
  PolarAreaController,
  RadarController,
  ScatterController,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
);
