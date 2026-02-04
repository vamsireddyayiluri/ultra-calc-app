import React, { useEffect, useState, useRef } from "react";
import logo from "../../assets/logo.png";
import { useAuth } from "../../contexts/AuthProvider";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { UserType } from "../../models/projectTypes";
import { getUserById } from "../../services/firebaseHelpers";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, LogOut, User } from "lucide-react";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = "Ultra-Calc",
  subtitle = "Room-by-room heat loss calculation and project management for HVAC professionals.",
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userData, setUserData] = useState<UserType | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isHomePage =
    location.pathname === "/" || location.pathname === "/dashboard";
  const isProfilePage = location.pathname === "/profile";

  // ✅ Fetch user details
  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userData: any = await getUserById(user.uid);
        setUserData(userData);
      }
    };
    fetchUserData();
  }, [user]);

  // ✅ Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white text-slate-900 shadow-sm border-b border-gray-200">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Ultra-Calc"
            className="w-44 cursor-pointer"
            onClick={() => navigate("/dashboard")}
          />
          <div className="hidden sm:block leading-tight">
            {subtitle && (
              <div className="text-sm text-[#4B5563]">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Right: Icons */}
        <div className="relative flex items-center gap-3" ref={dropdownRef}>
          {/* ✅ Home icon (show only when NOT on home page) */}
          {!isHomePage && (
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              title="Go to Home"
            >
              <Home className="w-6 h-6 text-slate-700" />
            </button>
          )}

          {/* ✅ Profile avatar — shown on all pages */}
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="relative flex items-center gap-2 focus:outline-none"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="User"
                className="w-9 h-9 rounded-full border border-gray-300"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold">
                {userData?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </button>

          {/* ✅ Dropdown Menu (below avatar, not overlapping) */}
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2">
              {/* Hide Profile Settings when already on profile page */}
              {!isProfilePage && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-gray-100"
                >
                  <User size={16} /> Profile Settings
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[#0F1724] hover:bg-gray-100"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
