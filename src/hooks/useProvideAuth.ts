// src/hooks/useProvideAuth.ts
import { useEffect, useState } from "react";
import { onAuthStateChanged, getAuth, User } from "firebase/auth";

export function useProvideAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const reloadUser = async () => {
    if (user) {
      await user.reload();
      setUser({ ...getAuth().currentUser! });
    }
  };

  return { user, loading, reloadUser };
}
