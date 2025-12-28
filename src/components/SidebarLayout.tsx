import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { clsx } from "clsx";

const navLink = (isActive: boolean) =>
  clsx(
    "block rounded px-3 py-2 text-sm",
    isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
  );

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <aside className="w-64 border-r bg-white p-4">
          <Link to="/" className="text-xl font-semibold">EasyShift</Link>
          <div className="mt-6 space-y-1">
            <NavLink to="/schedule/current" className={({ isActive }) => navLink(isActive)}>Published Schedule</NavLink>
            <NavLink to="/worker/constraints" className={({ isActive }) => navLink(isActive)}>Submit Constraints</NavLink>
            <NavLink to="/worker/swaps" className={({ isActive }) => navLink(isActive)}>Swaps</NavLink>
            <NavLink to="/worker/stats" className={({ isActive }) => navLink(isActive)}>My Stats</NavLink>
            <hr className="my-3" />
            <NavLink to="/admin" className={({ isActive }) => navLink(isActive)}>Admin Dashboard</NavLink>
            <NavLink to="/admin/settings" className={({ isActive }) => navLink(isActive)}>Org Settings</NavLink>
            <NavLink to="/admin/schedule" className={({ isActive }) => navLink(isActive)}>Schedule Builder</NavLink>
            <NavLink to="/admin/swaps" className={({ isActive }) => navLink(isActive)}>Swap Approvals</NavLink>
            <NavLink to="/notifications" className={({ isActive }) => navLink(isActive)}>Notifications</NavLink>
          </div>

          <button
            className="mt-6 w-full rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
            onClick={async () => { await signOut(); nav("/login"); }}
          >
            Sign out
          </button>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
