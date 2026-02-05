import { AppRouter } from "./app/routes/AppRouter";
import { ToastViewport } from "./components/ui/Toast";

function App() {
  return (
    <>
      <AppRouter />
      <ToastViewport />
    </>
  );
}

export default App;
