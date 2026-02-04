// src/components/auth/ForgotPassword.tsx
import React, { useState } from "react";
import { TextField, Button, CircularProgress } from "@mui/material";
import logo from "../../assets/logo.png";
import { sendResetEmail } from "../../lib/auth/authClient";
import { useSnackbar } from "../../contexts/SnackbarProvider";
import { useNavigate, Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showMessage } = useSnackbar();
  const navigate = useNavigate();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim()) {
      setErrorMsg("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      await sendResetEmail(email);
      showMessage("Password reset email sent successfully!", "success");
      navigate("/login");
    } catch (err: any) {
      const msg =
        err?.message ||
        "Failed to send password reset email. Please try again later.";
      setErrorMsg(msg);
      showMessage(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center bg-gray-100 min-h-screen px-4">
      <form
        onSubmit={handleForgot}
        className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full max-w-md transition-all"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-4">
          <img src={logo} alt="logo" className="h-18 object-contain" />
          <h2 className="mt-5 text-xl font-semibold text-gray-800">
            Forgot Password?
          </h2>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Enter your registered email and we’ll send a password reset link.
          </p>
        </div>

        {/* Email Field */}
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

        {/* Error Message */}
        {errorMsg && (
          <div className="mt-3 text-sm text-red-600 text-center bg-red-50 p-2 rounded">
            {errorMsg}
          </div>
        )}

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
          {loading ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            "Send Reset Email"
          )}
        </Button>

        {/* Navigation Links */}
        <div className="text-center mt-5 text-sm text-gray-600">
          Remembered your password?{" "}
          <Link
            to="/login"
            className="text-blue-600 font-medium hover:underline"
          >
            Sign In
          </Link>
        </div>
        <div className="text-center mt-1 text-sm text-gray-600">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 font-medium hover:underline"
          >
            Register
          </Link>
        </div>
      </form>
    </div>
  );
}
