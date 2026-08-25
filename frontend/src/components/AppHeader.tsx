import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
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
    <AppBar className="app-header" component="header" elevation={0} position="static">
      <Toolbar className="app-header__inner" disableGutters sx={{ minHeight: "100% !important" }}>
        <Link className="brand" to="/" aria-label="Spotter route and ELD logs home">
          <SpotterMark />
          <span className="brand-word">spotter</span>
        </Link>
        <span className="app-header__rule" aria-hidden="true" />
        <span className="app-header__product">Route &amp; ELD Logs</span>
      </Toolbar>
    </AppBar>
  );
}
