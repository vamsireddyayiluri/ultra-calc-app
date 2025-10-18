import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";


const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";

const loadGoogleMaps = (() => {
  let promise: Promise<void> | null = null;
  return () => {
    if (promise) return promise;
    promise = new Promise<void>((resolve, reject) => {
      if ((window as any).google && (window as any).google.maps) return resolve();

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
      console.log("Loading Google Maps API script:", script.src);
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
    return promise;
  };
})();

// --- Load API first, then render the app ---
loadGoogleMaps()
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  })
  .catch((err) => {
    console.error("Failed to load Google Maps API", err);
    // Fallback: render the app anyway, but components may fail
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
