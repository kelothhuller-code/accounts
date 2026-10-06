import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ margin: '2rem', padding: '2rem', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '12px' }}>
          <h3 style={{ color: '#991b1b', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚠️ View Render Error ({this.props.name || 'Component'})
          </h3>
          <p style={{ color: '#7f1d1d', fontSize: '0.9rem', fontWeight: 600 }}>
            {this.state.error && this.state.error.toString()}
          </p>
          {this.state.errorInfo && (
            <pre style={{ background: '#ffffff', padding: '1rem', borderRadius: '6px', fontSize: '0.78rem', color: '#991b1b', overflowX: 'auto', border: '1px solid #fca5a5' }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              if (this.props.onRetry) this.props.onRetry();
            }}
          >
            🔄 Retry Loading View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
