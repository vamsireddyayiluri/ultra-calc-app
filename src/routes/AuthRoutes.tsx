import { RouteObject } from "react-router-dom";
import RegisterPage from "../pages/auth/Register";
import LoginPage from "../pages/auth/Login";
import ForgotPasswordPage from "../pages/auth/Forgot";



export const authRoutes: RouteObject[] = [
  { path: "register", element: <RegisterPage /> },
  { path: "login", element: <LoginPage /> },
  { path: "forgot", element: <ForgotPasswordPage /> },
];
