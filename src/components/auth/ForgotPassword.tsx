import React, { useState } from "react";
import {
  TextField,
  Button,
} from "@mui/material";
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

    if (!email) {
      setErrorMsg("Email is required.");
      return;
    }

    try {
      setLoading(true);
      await sendResetEmail(email);
      showMessage("Password reset email sent!", "success");
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
    <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen">
      <form
        onSubmit={handleForgot}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm"
      >
        {/* ✅ Logo & Title */}
        <div className="flex flex-col items-center">
          <img src={logo} alt="logo" style={{ maxWidth: 160 }} />
          <h2 className="mt-6 text-xl font-semibold text-gray-800">
            Reset Your Password
          </h2>
        </div>

        {/* ✅ Email Field */}
        <TextField
          label="E-mail"
          type="email"
          required
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          margin="normal"
        />

        {/* ✅ Error Message */}
        {errorMsg && (
          <div className="mt-2 text-sm text-red-600 text-center bg-red-50 p-2 rounded">
            {errorMsg}
          </div>
        )}

        {/* ✅ Submit Button */}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? "Sending..." : "Send Reset Email"}
        </Button>

        {/* ✅ Navigation Links */}
        <div className="text-center mt-4 text-sm text-gray-600">
          Remembered your password?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign In
          </Link>
        </div>
        <div className="text-center mt-1 text-sm text-gray-600">
          Don’t have an account?{" "}
          <Link to="/register" className="text-blue-600 hover:underline">
            Register
          </Link>
        </div>
      </form>
    </div>
  );
}
