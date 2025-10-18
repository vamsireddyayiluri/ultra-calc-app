import React, { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import { useAuth } from "../../contexts/AuthProvider"; // adjust path as needed
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { UserType } from "../../models/projectTypes";
import { getUserById } from "../../services/firebaseHelpers";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = "Ultra-Calc",
  subtitle = "Room-by-room heat loss calculation and project management for HVAC professionals.",
}) => {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userData, setUserData] = useState<UserType>(null);
  useEffect(() => {
    // Fetch additional user data if needed
    const fetchUserData = async () => {
      if (user) {
        // Simulate fetching user data

        const userData: any = await getUserById(user.uid);

        setUserData(userData);
      }
    };
    fetchUserData();
  }, [user]);
  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/login"; // or use navigate()
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#FFF5E6] text-[#0F1724] shadow-md">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <img src={logo} alt="Ultra-Calc" className="w-32" />
          <div className="leading-tight">
            {" "}
            <h1 className="text-lg sm:text-2xl font-semibold text-[#0F1724]">
              {" "}
              {title}{" "}
            </h1>{" "}
            {subtitle && (
              <div className="text-sm text-[#4B5563]">{subtitle}</div>
            )}{" "}
          </div>
        </div>

        {/* Right: User Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 focus:outline-none"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="User"
                className="w-9 h-9 rounded-full border border-gray-300"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#0F1724] text-white flex items-center justify-center font-semibold">
                {userData?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2">
              <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                <div className="font-medium">{userData?.name || "User"}</div>
                <div className="text-xs text-gray-500">{user?.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-[#0F1724] hover:bg-[#FFF5E6]"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
