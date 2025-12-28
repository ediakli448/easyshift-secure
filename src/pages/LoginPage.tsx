import React from "react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { signInWithGoogle, user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">EasyShift</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in with Google to continue.
        </p>
        {user && <p className="mt-2 text-xs text-gray-500">Already signed in as {user.email}</p>}
        <button
          className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-black"
          onClick={() => void signInWithGoogle()}
        >
          Continue with Google
        </button>

        <p className="mt-4 text-xs text-gray-500">
          If you experience a login loop, ensure Supabase Auth redirect URLs match your domain.
        </p>
      </div>
    </div>
  );
}
