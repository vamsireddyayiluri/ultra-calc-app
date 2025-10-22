import React, { useState, useEffect, useRef } from "react";
import {
  TextField,
  Button,
  InputAdornment,
  IconButton,
  CircularProgress,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, Link } from "react-router-dom";
import logo from "../../assets/logo.png";
import { registerAction } from "../../lib/auth/authClient";
import { useSnackbar } from "../../contexts/SnackbarProvider";

// Supported regions
const COUNTRY_CODES = [
  { label: "US/Can (+1)", code: "+1", region: "US" },
  { label: "UK (+44)", code: "+44", region: "UK" },
  { label: "EU (+33)", code: "+33", region: "EU" },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterForm() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState({
    userName: "",
    userCell: "",
    userEmail: "",
    userPassword: "",
    company: "",
    address: "",
  });

  const [countryCode, setCountryCode] = useState("+1");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const { showMessage } = useSnackbar();

  // 📍 Setup Google Autocomplete
  useEffect(() => {
    const initAutocomplete = () => {
      if (!window.google || !inputRef.current) return;

      const options = {
        fields: ["geometry", "formatted_address"],
        types: ["address"],
      };

      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        options
      );

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry) {
          setLocationError("No details found for this address.");
          return;
        }
        const address = place.formatted_address;
        setAuth((prev) => ({ ...prev, address }));
        setLocationError(null);
      });
    };

    if (window.google && window.google.maps) {
      initAutocomplete();
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          initAutocomplete();
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("Geolocation not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${
              import.meta.env.VITE_GOOGLE_API_KEY
            }`
          );
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            setAuth((prev) => ({ ...prev, address }));
            if (inputRef.current) inputRef.current.value = address;
          }
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
        }
      },
      () => {
        setLocationError("Unable to fetch your location. Please allow access.");
      }
    );
  }, []);

  // --- VALIDATION LOGIC ---
  const validatePhone = (number: string, code: string) => {
    const cleaned = number.replace(/\D/g, "");
    switch (code) {
      case "+1": // US / CA
        return cleaned.length === 10;
      case "+44": // UK
        return cleaned.length >= 10 && cleaned.length <= 11;
      case "+33": // EU (France example)
        return cleaned.length === 9;
      default:
        return false;
    }
  };

  const validate = () => {
    const { userName, userCell, userEmail, userPassword, address } = auth;

    if (
      !userName.trim() ||
      !userCell.trim() ||
      !userEmail.trim() ||
      !userPassword ||
      !address.trim()
    ) {
      showMessage("Please fill in all required fields.", "error");
      return false;
    }

    if (!emailRegex.test(userEmail)) {
      showMessage("Please enter a valid email address.", "error");
      return false;
    }

    if (!validatePhone(userCell, countryCode)) {
      showMessage("Please enter a valid phone number.", "error");
      return false;
    }

    if (userPassword.length < 6) {
      showMessage("Password should be at least 6 characters.", "error");
      return false;
    }

    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const cleanedPhone = auth.userCell.replace(/\D/g, "");
      const payload = {
        name: auth.userName.trim(),
        cell: `${countryCode}${cleanedPhone}`,
        email: auth.userEmail.trim(),
        password: auth.userPassword,
        company: auth.company.trim(),
        address: auth.address.trim(),
      };
      console.log("Registration payload:", payload);
      await registerAction(payload, navigate);
    } catch (error: any) {
      const message = error?.message || "Registration failed.";
      console.error(error.message);
      if (
        message?.includes("invalid-credential") ||
        message?.includes("email-already-in-use")
      ) {
        showMessage("The email address is already in use.", "error");
      } else showMessage("Registration failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center bg-[#FFF8EE] min-h-screen px-4 py-8">
      <form
        onSubmit={handleRegister}
        className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full max-w-md transition-all"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-4">
          <img src={logo} alt="logo" style={{ maxWidth: 160 }} />
          <h2 className="mt-5 text-xl font-semibold text-gray-800">
            Create Your Free Account
          </h2>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Please fill in the details to get started
          </p>
        </div>

        {/* Input Fields */}
        <div className="space-y-3">
          <TextField
            label="Full Name"
            required
            fullWidth
            value={auth.userName}
            onChange={(e) => setAuth({ ...auth, userName: e.target.value })}
            variant="outlined"
            margin="dense"
          />

          {/* Phone Input + Country Code */}
          <TextField
            label="Phone Number"
            required
            fullWidth
            value={auth.userCell}
            onChange={(e) =>
              setAuth({
                ...auth,
                userCell: e.target.value.replace(/[^\d\- ]/g, ""),
              })
            }
            variant="outlined"
            margin="dense"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <TextField
                    select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    variant="standard"
                    sx={{
                      "& .MuiInputBase-root": {
                        borderBottom: "none", // Remove underline
                      },
                      "& .MuiInput-underline:before, & .MuiInput-underline:after":
                        {
                          borderBottom: "none",
                        },
                      minWidth: 60,
                    }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <MenuItem key={c.code} value={c.code}>
                        {c.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="E-mail"
            type="email"
            required
            fullWidth
            value={auth.userEmail}
            onChange={(e) => setAuth({ ...auth, userEmail: e.target.value })}
            variant="outlined"
            margin="dense"
          />

          <TextField
            label="Company (Optional)"
            fullWidth
            value={auth.company}
            onChange={(e) => setAuth({ ...auth, company: e.target.value })}
            variant="outlined"
            margin="dense"
          />

          <TextField
            label="Address"
            required
            fullWidth
            inputRef={inputRef} // 👈 Google Places needs this
            value={auth.address}
            onChange={(e) => setAuth({ ...auth, address: e.target.value })}
            placeholder="Street, City, State/Province, Postal Code"
            variant="outlined"
            margin="dense"
            error={Boolean(locationError)}
            helperText={locationError ?? ""}
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            required
            fullWidth
            value={auth.userPassword}
            onChange={(e) => setAuth({ ...auth, userPassword: e.target.value })}
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
            helperText="Minimum 6 characters"
          />
        </div>

        {/* Error Message */}

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
          {loading ? <CircularProgress size={24} color="inherit" /> : "Sign Up"}
        </Button>

        {/* Footer */}
        <div className="text-center mt-5 text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-blue-600 font-medium hover:underline"
          >
            Sign In
          </Link>
        </div>
      </form>
    </div>
  );
}
