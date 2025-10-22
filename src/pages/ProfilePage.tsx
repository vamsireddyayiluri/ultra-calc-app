import React, { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  Divider,
  Container,
  Paper,
} from "@mui/material";
import { deepPurple } from "@mui/material/colors";
import { useAuth } from "../contexts/AuthProvider";
import { useSnackbar } from "../contexts/SnackbarProvider";
import { getUserById, updateUserById } from "../services/firebaseHelpers";
import { AppLayout } from "../components/layout/AppLayout";

export default function ProfilePage() {
  const { user } = useAuth();
  const { showMessage } = useSnackbar();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cell: "",
    company: "",
    address: "",
    role: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (!user?.uid) return;
      try {
        const data = await getUserById(user.uid);
        setFormData({
          name: data?.name || "",
          email: user.email || "",
          cell: data?.cell || "",
          company: data?.company || "",
          address: data?.address || "",
          role: data?.role || "",
        });
      } catch (err) {
        showMessage("Failed to fetch profile data.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    setSaving(true);
    try {
      await updateUserById(user.uid, formData);
      showMessage("Profile updated successfully!", "success");
    } catch (err) {
      console.error(err);
      showMessage("Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <Box display="flex" justifyContent="center" mt={10}>
          <CircularProgress />
        </Box>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
          {/* Header */}
          <Box mb={4}>
            <Typography variant="h4" fontWeight={700}>
              Account Settings
            </Typography>
            <Divider sx={{ my: 2 }} />
          </Box>

          {/* Avatar and Name */}
          <Box display="flex" flexDirection="column" alignItems="center" mb={4}>
            <Avatar
              sx={{
                bgcolor: deepPurple[500],
                width: 80,
                height: 80,
                fontSize: 32,
                mb: 1.5,
              }}
            >
              {formData.name?.[0]?.toUpperCase() || "U"}
            </Avatar>
            <Typography variant="h5" fontWeight={700}>
              {formData.name || "Your Name"}
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* Profile Form */}
          <form onSubmit={handleSubmit}>
            <Box display="flex" flexDirection="column" gap={3}>
              <TextField
                name="name"
                label="Full Name"
                fullWidth
                variant="standard"
                value={formData.name}
                onChange={handleChange}
                InputProps={{
                  sx: {
                    fontSize: 16,
                    pb: 1,
                    "&:before": { borderBottom: "1px solid #ccc" },
                    "&:hover:not(.Mui-disabled):before": {
                      borderBottom: "2px solid #2364aa",
                    },
                    "&:after": { borderBottom: "2px solid #2364aa" },
                  },
                }}
              />

              <TextField
                name="email"
                label="Email"
                fullWidth
                variant="standard"
                value={formData.email}
                disabled
                InputProps={{
                  sx: {
                    fontSize: 16,
                    pb: 1,
                    color: "text.secondary",
                    "&:before": { borderBottom: "1px solid #ccc" },
                  },
                }}
              />

              <TextField
                name="cell"
                label="Phone Number"
                fullWidth
                variant="standard"
                value={formData.cell}
                onChange={handleChange}
                InputProps={{
                  sx: {
                    fontSize: 16,
                    pb: 1,
                    "&:before": { borderBottom: "1px solid #ccc" },
                    "&:hover:not(.Mui-disabled):before": {
                      borderBottom: "2px solid #2364aa",
                    },
                    "&:after": { borderBottom: "2px solid #2364aa" },
                  },
                }}
              />

              <TextField
                name="company"
                label="Company"
                fullWidth
                variant="standard"
                value={formData.company}
                onChange={handleChange}
                InputProps={{
                  sx: {
                    fontSize: 16,
                    pb: 1,
                    "&:before": { borderBottom: "1px solid #ccc" },
                    "&:hover:not(.Mui-disabled):before": {
                      borderBottom: "2px solid #2364aa",
                    },
                    "&:after": { borderBottom: "2px solid #2364aa" },
                  },
                }}
              />

              <TextField
                name="address"
                label="Address"
                fullWidth
                multiline
                rows={2}
                variant="standard"
                value={formData.address}
                onChange={handleChange}
                InputProps={{
                  sx: {
                    fontSize: 16,
                    pb: 1,
                    "&:before": { borderBottom: "1px solid #ccc" },
                    "&:hover:not(.Mui-disabled):before": {
                      borderBottom: "2px solid #2364aa",
                    },
                    "&:after": { borderBottom: "2px solid #2364aa" },
                  },
                }}
              />
            </Box>

            {/* Save Button */}
            <Box display="flex" justifyContent="flex-end" mt={4}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                disabled={saving}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  px: 4,
                  py: 1.5,
                }}
              >
                {saving ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </Box>
          </form>
        </Paper>
      </Container>
    </AppLayout>
  );
}
