import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // You could send this to an error-reporting service
    // console.error('Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <h2>Something went wrong.</h2>
          <pre style={{ color: "#b91c1c" }}>{String(this.state.error)}</pre>
          <p>
            Please reload the page. If the problem persists, check the browser
            console for details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
