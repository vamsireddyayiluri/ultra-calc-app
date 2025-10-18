import { reauthenticateUser } from "../../lib/auth/authClient";
import { useAuth } from "../../contexts/AuthProvider";
import { useState } from "react";

export default function ReauthModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");

  const handleReauth = async () => {
    if (!user) return;
    try {
      await reauthenticateUser(user, password);
      alert("Reauthenticated!");
      onClose();
    } catch {
      alert("Invalid password.");
    }
  };

  return (
    <div className="p-6">
      <h3>Reauthenticate</h3>
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleReauth}>Confirm</button>
    </div>
  );
}
