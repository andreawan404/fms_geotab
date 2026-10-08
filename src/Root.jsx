import React from 'react';
import { AppProvider } from './AppContext.jsx';
import App from './App.jsx';

class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    console.error('[TMS]', err);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, color: '#8f1d1d', fontFamily: 'sans-serif' }}>
          <b>TMS error:</b> {String(this.state.err.message || this.state.err)}{' '}
          <button onClick={() => this.setState({ err: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Root({ api, addInId, active = true, seed }) {
  return (
    <Boundary>
      <AppProvider api={api} addInId={addInId} active={active} seed={seed}>
        <App addInId={addInId} />
      </AppProvider>
    </Boundary>
  );
}
