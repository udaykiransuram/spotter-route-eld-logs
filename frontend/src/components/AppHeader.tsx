import { Link } from "react-router-dom";

function SpotterMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i className="brand-dot brand-dot--coral" />
      <i className="brand-dot brand-dot--mint" />
      <i className="brand-dot brand-dot--blue" />
      <i className="brand-dot brand-dot--silver" />
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" to="/" aria-label="Spotter route and ELD logs home">
          <SpotterMark />
          <span className="brand-word">spotter</span>
        </Link>
        <span className="app-header__rule" aria-hidden="true" />
        <span className="app-header__product">Route &amp; ELD Logs</span>
      </div>
    </header>
  );
}
