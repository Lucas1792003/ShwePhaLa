import { AppRouter } from "./app/routes/AppRouter";
import { ToastViewport } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
      <ToastViewport />
    </ErrorBoundary>
  );
}

export default App;
