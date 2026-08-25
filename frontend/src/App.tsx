import { Route, Routes } from "react-router-dom";
import { DailyLogsPage } from "./pages/DailyLogsPage";
import { RoutePage } from "./pages/RoutePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RoutePage />} />
      <Route path="/logs" element={<DailyLogsPage />} />
      <Route path="*" element={<RoutePage />} />
    </Routes>
  );
}
