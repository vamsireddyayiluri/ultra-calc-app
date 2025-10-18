// src/routes/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { CircularProgress } from "@mui/material";

export default function ProtectedRoute({
  guestOnly = false,
}: {
  guestOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (loading) return; // wait for auth to load

    // Guest routes (login/register/etc.)
    if (guestOnly) {
      if (currentUser && currentUser.emailVerified) {
        setRedirectPath("/dashboard");
      } else {
        setRedirectPath(null);
      }
    } else {
      // Protected routes (dashboard/etc.)
      if (!currentUser) {
        setRedirectPath("/login");
      } else if (!currentUser.emailVerified) {
        setRedirectPath("/verify");
      } else {
        setRedirectPath(null);
      }
    }

    setReady(true);
  }, [loading, user, guestOnly]);

  if (loading || !ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <CircularProgress color="primary" size={48} thickness={4} />
      </div>
    );
  }

  if (redirectPath) {
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  return <Outlet />;
}
