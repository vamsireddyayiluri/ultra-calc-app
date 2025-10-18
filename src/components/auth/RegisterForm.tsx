import React, { useState } from "react";
import {
  TextField,
  Button,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, Link } from "react-router-dom";
import logo from "../../assets/logo.png";
import { registerAction } from "../../lib/auth/authClient";

const phoneRegex = /^[0-9]{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterForm() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState({
    userName: "",
    userCell: "",
    userEmail: "",
    userPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showError, setShowError] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (
      !auth.userName ||
      !auth.userCell ||
      !auth.userEmail ||
      !auth.userPassword
    )
      return false;
    if (!emailRegex.test(auth.userEmail)) return false;
    if (!phoneRegex.test(auth.userCell)) return false;
    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowError(false);
    setErrorMsg("");

    if (!validate()) {
      setShowError(true);
      setErrorMsg("Please fill in all required fields correctly.");
      return;
    }

    if (auth.userPassword.length < 6) {
      setShowError(true);
      setErrorMsg("Password should be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: auth.userName,
        cell: auth.userCell,
        email: auth.userEmail,
        password: auth.userPassword,
      };

      await registerAction(payload, navigate, setErrorMsg);
    } catch (error: any) {
      console.error(error.message);
      setErrorMsg("Registration failed.");
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen">
      <form
        onSubmit={handleRegister}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm"
      >
        <div className="flex flex-col items-center">
          <img src={logo} alt="logo" style={{ maxWidth: 160 }} />
          <h2 className="mt-6 text-xl font-semibold text-gray-800">
            Create your Free Account
          </h2>
        </div>

        <TextField
          label="Full Name"
          required
          fullWidth
          value={auth.userName}
          onChange={(e) => setAuth({ ...auth, userName: e.target.value })}
          margin="normal"
        />

        <TextField
          label="Phone Number"
          required
          fullWidth
          value={auth.userCell}
          onChange={(e) => setAuth({ ...auth, userCell: e.target.value })}
          margin="normal"
          inputProps={{ maxLength: 10 }}
        />

        <TextField
          label="E-mail"
          type="email"
          required
          fullWidth
          value={auth.userEmail}
          onChange={(e) => setAuth({ ...auth, userEmail: e.target.value })}
          margin="normal"
        />

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          required
          fullWidth
          value={auth.userPassword}
          onChange={(e) =>
            setAuth({ ...auth, userPassword: e.target.value })
          }
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

        {showError && (
          <div className="mt-2 text-sm text-red-600 text-center bg-red-50 p-2 rounded">
            {errorMsg}
          </div>
        )}

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? "Signing Up..." : "Sign Up"}
        </Button>

        <div className="text-center mt-4 text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
