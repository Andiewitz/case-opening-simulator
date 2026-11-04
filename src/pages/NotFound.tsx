import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="uo-page">
      <div className="uo-page-head">
        <h1 className="uo-title">Page not found</h1>
        <p className="uo-sub">That route doesn't exist — the link may be stale.</p>
      </div>
      <div className="uo-empty">
        <strong>Nothing here</strong>
        Head back to the cases and keep unboxing.
        <div>
          <Link to="/" className="uo-btn uo-btn-primary uo-btn-sm mt-4">
            Browse Cases
          </Link>
        </div>
      </div>
    </div>
  );
}
