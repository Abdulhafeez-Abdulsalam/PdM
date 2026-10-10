/**
 * Catches a crash inside its children and shows a fallback instead, so one broken widget
 * never blanks the whole dashboard (architecture §4). React only supports this as a class.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
