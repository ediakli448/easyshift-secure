import React from "react";
import { Routes, Route } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SidebarLayout } from "./components/SidebarLayout";
import { HomeGate } from "./pages/HomeGate";
import { JoinOrgPage } from "./pages/JoinOrgPage";
import { PublishedSchedulePage } from "./pages/PublishedSchedulePage";
import { NotificationsPage } from "./pages/NotificationsPage";

import { CreateOrgPage } from "./pages/admin/CreateOrgPage";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { OrgSettingsPage } from "./pages/admin/OrgSettingsPage";
import { ScheduleBuilderPage } from "./pages/admin/ScheduleBuilderPage";
import { SwapApprovalsPage } from "./pages/admin/SwapApprovalsPage";

import { SubmitConstraintsPage } from "./pages/worker/SubmitConstraintsPage";
import { WorkerSwapsPage } from "./pages/worker/WorkerSwapsPage";
import { WorkerStatsPage } from "./pages/worker/WorkerStatsPage";

// Wrapper for protected routes with optional admin requirement
function AuthedShell({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  return (
    <ProtectedRoute requireAdmin={requireAdmin}>
      <SidebarLayout>{children}</SidebarLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/join/:token"
        element={
          <AuthedShell>
            <JoinOrgPage />
          </AuthedShell>
        }
      />

      <Route
        path="/"
        element={
          <AuthedShell>
            <HomeGate />
          </AuthedShell>
        }
      />

      {/* Public routes (any authenticated member) */}
      <Route
        path="/schedule/current"
        element={
          <AuthedShell>
            <PublishedSchedulePage />
          </AuthedShell>
        }
      />
      <Route
        path="/notifications"
        element={
          <AuthedShell>
            <NotificationsPage />
          </AuthedShell>
        }
      />

      {/* Admin-only routes - requireAdmin enforces server-side role check */}
      <Route
        path="/admin/create-org"
        element={
          <AuthedShell requireAdmin={true}>
            <CreateOrgPage />
          </AuthedShell>
        }
      />
      <Route
        path="/admin"
        element={
          <AuthedShell requireAdmin={true}>
            <AdminDashboard />
          </AuthedShell>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AuthedShell requireAdmin={true}>
            <OrgSettingsPage />
          </AuthedShell>
        }
      />
      <Route
        path="/admin/schedule"
        element={
          <AuthedShell requireAdmin={true}>
            <ScheduleBuilderPage />
          </AuthedShell>
        }
      />
      <Route
        path="/admin/swaps"
        element={
          <AuthedShell requireAdmin={true}>
            <SwapApprovalsPage />
          </AuthedShell>
        }
      />

      {/* Worker routes */}
      <Route
        path="/worker/constraints"
        element={
          <AuthedShell>
            <SubmitConstraintsPage />
          </AuthedShell>
        }
      />
      <Route
        path="/worker/swaps"
        element={
          <AuthedShell>
            <WorkerSwapsPage />
          </AuthedShell>
        }
      />
      <Route
        path="/worker/stats"
        element={
          <AuthedShell>
            <WorkerStatsPage />
          </AuthedShell>
        }
      />
    </Routes>
  );
}
