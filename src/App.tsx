import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./contexts/AuthProvider";
import { SnackbarProvider } from "./contexts/SnackbarProvider";
import { ChatWidget } from "./components/chat/ChatWidget";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SnackbarProvider>
          <AppRoutes />
          <ChatWidget />
        </SnackbarProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
