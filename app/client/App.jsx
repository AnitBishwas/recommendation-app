import { useRoutes, Link } from "raviger";
import routes from "./Routes";
import AppBridgeProvider from "./providers/AppBridgeProvider";

export default function App() {
  const RouteComponents = useRoutes(routes);

  return (
    <AppBridgeProvider>
      <ui-nav-menu>
        <Link href="/campaigns">Campaigns</Link>
      </ui-nav-menu>
      {RouteComponents}
    </AppBridgeProvider>
  );
}
