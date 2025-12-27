import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";

type OrgRole = "ADMIN" | "WORKER";
type StaffRole = "VET" | "ASSISTANT";

type OrgContextType = {
  activeOrgId: string | null;
  activeRole: OrgRole | null;
  activeStaffRole: StaffRole | null;
  setActiveOrgId: (orgId: string) => Promise<boolean>;
  loading: boolean;
  clearOrg: () => void;
};

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<OrgRole | null>(null);
  const [activeStaffRole, setActiveStaffRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate stored org on mount
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const stored = localStorage.getItem("easyshift.activeOrgId");
    if (stored) {
      validateAndSet(stored);
    } else {
      setLoading(false);
    }
  }, [user, authLoading]);

  const validateAndSet = async (orgId: string): Promise<boolean> => {
    if (!user) return false;

    setLoading(true);
    try {
      // Server-side membership validation - NEVER trust localStorage
      const { data, error } = await supabase
        .from("org_members")
        .select("org_id, role, staff_role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        // User is not a member of this org - clear invalid state
        localStorage.removeItem("easyshift.activeOrgId");
        localStorage.removeItem("easyshift.activeOrgRole");
        setActiveOrgIdState(null);
        setActiveRole(null);
        setActiveStaffRole(null);
        setLoading(false);
        return false;
      }

      // Valid membership confirmed by server
      localStorage.setItem("easyshift.activeOrgId", orgId);
      localStorage.setItem("easyshift.activeOrgRole", data.role);
      setActiveOrgIdState(orgId);
      setActiveRole(data.role as OrgRole);
      setActiveStaffRole(data.staff_role as StaffRole | null);
      setLoading(false);
      return true;
    } catch (e) {
      console.error("Org validation failed:", e);
      setActiveOrgIdState(null);
      setActiveRole(null);
      setActiveStaffRole(null);
      setLoading(false);
      return false;
    }
  };

  const clearOrg = () => {
    localStorage.removeItem("easyshift.activeOrgId");
    localStorage.removeItem("easyshift.activeOrgRole");
    setActiveOrgIdState(null);
    setActiveRole(null);
    setActiveStaffRole(null);
  };

  return (
    <OrgContext.Provider
      value={{
        activeOrgId,
        activeRole,
        activeStaffRole,
        setActiveOrgId: validateAndSet,
        loading,
        clearOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
