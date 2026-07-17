"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface State {
  error?: Error;
}

/** Catches render errors in the interactive tree so the whole app never blanks. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // In production this is where you'd forward to your monitoring service.
    console.error("Uncaught render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md p-6">
          <Alert tone="danger" title="Something broke">
            {this.state.error.message}
          </Alert>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => this.setState({ error: undefined })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
