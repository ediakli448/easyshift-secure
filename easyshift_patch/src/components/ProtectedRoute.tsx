import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useOrg } from "../contexts/OrgContext";
import { supabase } from "../lib/supabaseClient";

type Props = {
  children: React.ReactNode;
  requireAdmin?: boolean;
};

export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { activeOrgId, activeRole, loading: orgLoading } = useOrg();
  const [serverRole, setServerRole] = useState<"ADMIN" | "WORKER" | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Fetch role from server for double-validation on admin routes
  useEffect(() => {
    if (authLoading || orgLoading || !user) {
      setRoleLoading(false);
      return;
    }

    if (!activeOrgId) {
      setRoleLoading(false);
      return;
    }

    // Only do server-side check for admin routes to avoid extra queries
    if (!requireAdmin) {
      setServerRole(activeRole);
      setRoleLoading(false);
      return;
    }

    // Server-side role verification for admin routes
    (async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", activeOrgId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Role check failed:", error);
        setServerRole(null);
      } else {
        setServerRole((data?.role as "ADMIN" | "WORKER") ?? null);
      }
      setRoleLoading(false);
    })();
  }, [user, authLoading, activeOrgId, orgLoading, requireAdmin, activeRole]);

  // Show loading while checking auth/org/role
  if (authLoading || orgLoading || roleLoading) {
    return <div className="p-6">Loading…</div>;
  }

  // Not authenticated - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin route but user is not admin - redirect to worker home
  if (requireAdmin && serverRole !== "ADMIN") {
    return <Navigate to="/schedule/current" replace />;
  }

  return <>{children}</>;
}
