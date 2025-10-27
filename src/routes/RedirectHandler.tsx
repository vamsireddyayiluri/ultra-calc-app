// src/routes/RedirectHandler.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";
import { auth } from "../firebase";
import { CircularProgress } from "@mui/material";

export default function RedirectHandler() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const currentUser = auth.currentUser;

    if (currentUser) {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [loading, user]);

  return (
    <div className="flex h-screen items-center justify-center">
      <CircularProgress color="primary" size={48} thickness={4} />{" "}
    </div>
  );
}
