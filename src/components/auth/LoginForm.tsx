// src/components/auth/LoginForm.tsx
import React, { useState } from "react";
import {
  TextField,
  Button,
  InputAdornment,
  IconButton,
  CircularProgress,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useSnackbar } from "../../contexts/SnackbarProvider";
import { useNavigate, Link } from "react-router-dom";
import logo from "../../assets/logo.png";
import { send_login_request } from "../../lib/auth/authClient";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { showMessage } = useSnackbar();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await send_login_request({ email, password }, navigate, showMessage);
    } catch (err: any) {
      console.log(err, "error");
      const message = typeof err === "string" ? err : err.message;
      if (
        message?.includes("invalid-credential") ||
        message?.includes("user-not-found")
      ) {
        showMessage("Invalid email or password.", "error");
      } else if (message === "auth/too-many-requests") {
        showMessage("Too many attempts. Try again later.", "error");
      } else {
        showMessage("Login failed.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen px-4">
      <form
        onSubmit={handleLogin}
        className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full max-w-md transition-all"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-4">
          <img src={logo} alt="logo" style={{ maxWidth: 160 }} />
          <h2 className="mt-5 text-xl font-semibold text-gray-800">
            Welcome Back
          </h2>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Log in to your Ultra-Fin account
          </p>
        </div>

        {/* Input Fields */}
        <div className="space-y-3">
          <TextField
            label="E-mail"
            type="email"
            required
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            margin="dense"
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            required
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="outlined"
            margin="dense"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <Visibility /> : <VisibilityOff />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </div>

        {/* Forgot Password */}
        <div className="flex justify-end mt-2 text-sm">
          <Link
            to="/forgot"
            className="text-blue-600 hover:underline font-medium"
          >
            Forgot your password?
          </Link>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={loading}
          sx={{
            mt: 3,
            py: 1.2,
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : "Log In"}
        </Button>

        {/* Footer Links */}
        <div className="text-center mt-5 text-sm text-gray-600">
          Don’t have an account?{" "}
          <Link to="/register" className="text-blue-600 font-medium hover:underline">
            Sign Up
          </Link>
        </div>
      </form>
    </div>
  );
}
