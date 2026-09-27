import { Component } from "react";
import { reportError } from "../lib/errorReporting";

/** A rendering crash anywhere below shows a recoverable message (and gets
 * reported) instead of leaving the whole page blank. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportError(Object.assign(error, { stack: `${error?.stack || ""}\n--- component stack ---${info?.componentStack || ""}` }), "render");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <div className="empty" style={{ marginTop: 60 }}>
          화면을 그리는 중에 문제가 발생했어요. 새로고침하면 대부분 해결돼요.
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
          </div>
        </div>
      </div>
    );
  }
}
