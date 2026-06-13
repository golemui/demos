import type { BuiltRequest } from '../lib/requestPreview';

/**
 * The live request panel — a plain React component (not a GolemUI widget) fed
 * by the form's change events, so the GolemUI form definition stays pristine
 * JSON. Shows the request line, the JSON body (or a note for query requests),
 * and a copy-pasteable curl command.
 */
export function RequestPreview({ request }: { request: BuiltRequest }) {
  return (
    <div className="request-preview">
      <div className="request-preview__bar">
        <span className="request-preview__dot" data-method={request.method.toLowerCase()} />
        <span className="request-preview__endpoint">{request.url}</span>
      </div>
      <pre className="request-preview__code">
        {request.body ? (
          <>
            <span className="request-preview__comment"># Content-Type: application/json</span>
            {'\n'}
            {request.body}
          </>
        ) : (
          <span className="request-preview__comment">
            # No request body — parameters are sent in the URL above.
          </span>
        )}
      </pre>
      <div className="request-preview__bar request-preview__bar--curl">
        <span className="request-preview__label">curl</span>
      </div>
      <pre className="request-preview__code request-preview__code--curl">{request.curl}</pre>
    </div>
  );
}
