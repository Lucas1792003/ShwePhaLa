import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  // Optional override of the fallback UI. If supplied it is given the captured
  // error and a reset() handler so callers can build context-specific recoveries
  // (e.g. a drawer-scoped boundary that just closes the drawer on reset).
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Top-level error boundary. Catches render-time exceptions anywhere below it
// and presents a friendly recovery surface instead of a blank screen.
//
// Behavior:
//  - "Try again" resets the boundary so children re-mount fresh.
//  - "Reload" full-page reloads in case the JS state is wedged.
//  - Stack traces are only shown when import.meta.env.DEV is true.
//
// Note: this catches RENDER errors. It does not catch async/Promise rejections
// from event handlers — those still need useAsyncAction / try-catch.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const isDev = Boolean(import.meta.env?.DEV);

    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mb-2 text-base font-semibold text-slate-800">Something went wrong</div>
          <p className="mb-4 text-sm text-slate-500">
            The page hit an unexpected error. You can try again or reload the app.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
          {isDev && (
            <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
