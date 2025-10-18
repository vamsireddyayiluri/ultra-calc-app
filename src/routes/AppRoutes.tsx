// src/routes/AppRoutes.tsx
import { useRoutes } from "react-router-dom";
import { authRoutes } from "./AuthRoutes";
import ProtectedRoute from "./ProtectedRoute";
import HomePage from "../pages/HomePage";
import RedirectHandler from "./RedirectHandler";
import ProjectPage from "../pages/ProjectPage";

export default function AppRoutes() {
  const routes = [
    // Root — auto redirect based on auth state
    { path: "/", element: <RedirectHandler /> },

    // Guest-only routes (login/register/etc.)
    {
      element: <ProtectedRoute guestOnly />,
      children: authRoutes,
    },

    // Authenticated routes
    {
      element: <ProtectedRoute />,
      children: [{ path: "/dashboard", element: <HomePage /> }],
    },
    {
      element: <ProtectedRoute />,
      children: [{ path: "/project", element: <ProjectPage /> }],
    },
    {
      element: <ProtectedRoute />,
      children: [{ path: "/project/:id", element: <ProjectPage /> }],
    },


    // 404 fallback
    {
      path: "*",
      element: (
        <div className="p-8 text-center text-gray-600">
          404 — Page not found
        </div>
      ),
    },
  ];

  return useRoutes(routes);
}
