import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort boundary. Without one, a single render error (a malformed crate
 * payload, a missing field in a rolled item) blanks the whole app with no way
 * back except a manual reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the detail that CloudWatch/instrumentation would want, without a
    // dependency: the console is the only sink this app has today.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="uo-boundary" role="alert">
        <h1 className="uo-title">Something broke</h1>
        <p style={{ color: "#c9d1e0", maxWidth: 520 }}>
          The app hit an unexpected error. Your inventory and balance are stored on the server and
          are not affected.
        </p>
        <pre>{error.message}</pre>
        <button
          type="button"
          className="uo-btn uo-btn-primary"
          onClick={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
