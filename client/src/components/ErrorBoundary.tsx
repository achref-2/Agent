import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBox } from "./ui";

/** Keeps a crash in one page from blanking the whole app; the error is shown and logged to the console. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed", error, info.componentStack);
  }

  render() {
    if (this.state.error) return <ErrorBox message={`This page crashed: ${this.state.error.message}. Reload the page or open another section.`} />;
    return this.props.children;
  }
}
