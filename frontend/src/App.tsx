import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RoutePage } from "./pages/RoutePage";

const DailyLogsPage = lazy(() => import("./pages/DailyLogsPage").then((module) => ({
  default: module.DailyLogsPage,
})));

export function App() {
  return (
    <Suspense fallback={<div className="page-loading" role="status">Loading daily logs…</div>}>
      <Routes>
        <Route path="/" element={<RoutePage />} />
        <Route path="/logs" element={<DailyLogsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
