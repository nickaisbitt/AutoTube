import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface-950">
          <div className="mx-auto max-w-md space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center bg-red-500 text-black">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">Something went wrong</h2>
            <p className="text-sm font-mono text-surface-400">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 bg-brand-500 px-6 py-3 text-sm font-bold uppercase text-black shadow-[4px_4px_0px_#ff5500] hover:bg-brand-400"
            >
              <RotateCcw className="h-4 w-4" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
