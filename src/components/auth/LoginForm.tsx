// src/components/auth/LoginForm.tsx
import React, { useState } from "react";
import {
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useSnackbar } from "../../contexts/SnackbarProvider";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import { send_login_request } from "../../lib/auth/authClient";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const { showMessage } = useSnackbar();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await send_login_request({ email, password }, navigate, showMessage); // All logic handled inside
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
    <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen">
      <form
        onSubmit={handleLogin}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm"
      >
        <div className="flex flex-col items-center">
          <img src={logo} alt="logo" style={{ maxWidth: 160 }} />
          <h2 className="mt-6 text-xl font-semibold">Log in to Ultra-Fin</h2>
        </div>

        <TextField
          label="E-mail"
          type="email"
          required
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          margin="normal"
        />

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          required
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          margin="normal"
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

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={loading}
          sx={{ mt: 2 }}
          loading={loading}
        >
          Log In
        </Button>

        <div className="text-center mt-4 text-sm text-gray-600">
          Forgot your password?{" "}
          <a href="/forgot" className="text-blue-600 hover:underline">
            Reset your password
          </a>
        </div>
        <div className="text-center mt-1 text-sm text-gray-600">
          Don't have an account?{" "}
          <a href="/register" className="text-blue-600 hover:underline">
            Sign Up
          </a>
        </div>
      </form>
    </div>
  );
}
