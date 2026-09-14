import { Component, type ErrorInfo, type ReactNode } from "react";

interface BoundaryProps {
  onFail: () => void;
  children: ReactNode;
}

/**
 * Keeps the DOM product alive when the 3D world cannot: the lazy chunk failing to load, or R3F throwing
 * synchronously because a context cannot be created. Three-free on purpose so the app shell can import it
 * without pulling the scene into the main bundle.
 */
export class WorldBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("world: falling back to the flat product", error, info.componentStack);
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? <div className="world world-flat" aria-hidden /> : this.props.children;
  }
}
