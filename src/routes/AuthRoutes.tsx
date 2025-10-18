import { RouteObject } from "react-router-dom";
import RegisterPage from "../pages/auth/register";
import LoginPage from "../pages/auth/login";
import VerifyPage from "../components/auth/VerifyEmail";
import ForgotPasswordPage from "../pages/auth/forgot";
import ResetPasswordPage from "../pages/auth/reset";


export const authRoutes: RouteObject[] = [
  { path: "register", element: <RegisterPage /> },
  { path: "login", element: <LoginPage /> },
  { path: "verify", element: <VerifyPage /> },
  { path: "forgot", element: <ForgotPasswordPage /> },
  { path: "reset", element: <ResetPasswordPage /> },
];
