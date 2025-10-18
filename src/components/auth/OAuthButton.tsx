import { signInWithGoogle } from "../../lib/auth/authClient";
import { useNavigate } from "react-router-dom";

export default function OAuthButton() {
  const navigate = useNavigate();

  const handleGoogle = async () => {
    try {
      const result = await signInWithGoogle();
      if (!result.user.emailVerified) navigate("/verify");
      else navigate("/dashboard");
    } catch (err) {
      alert("Google sign-in failed.");
    }
  };

  return (
    <button onClick={handleGoogle} className="border px-4 py-2 rounded-md">
      Continue with Google
    </button>
  );
}
