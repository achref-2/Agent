import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { ToastProvider } from "./components/toast";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginPage } from "./pages/Login";

// Pages load on demand so the first paint only ships the shell.
const DashboardPage = lazy(() => import("./pages/Dashboard").then((mod) => ({ default: mod.DashboardPage })));
const AssistantPage = lazy(() => import("./pages/Assistant").then((mod) => ({ default: mod.AssistantPage })));
const TasksPage = lazy(() => import("./pages/Tasks").then((mod) => ({ default: mod.TasksPage })));
const StudyPage = lazy(() => import("./pages/Study").then((mod) => ({ default: mod.StudyPage })));
const GermanPage = lazy(() => import("./pages/German").then((mod) => ({ default: mod.GermanPage })));
const JobsPage = lazy(() => import("./pages/Jobs").then((mod) => ({ default: mod.JobsPage })));
const DocumentsPage = lazy(() => import("./pages/Documents").then((mod) => ({ default: mod.DocumentsPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((mod) => ({ default: mod.SettingsPage })));

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><Spinner label="Starting GhostMate" /></div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="german" element={<GermanPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
