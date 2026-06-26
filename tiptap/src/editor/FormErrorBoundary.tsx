import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a malformed `formDef` from crashing the whole editor: if `<GuiForm>`
 * throws while rendering an embedded form, we show an inline error in that block
 * instead of tearing down the document.
 */
export class FormErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gfb__error" role="alert">
          <span className="material-icons" aria-hidden="true">
            error_outline
          </span>
          <div>
            <strong>This form definition couldn’t be rendered.</strong>
            <p>{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
