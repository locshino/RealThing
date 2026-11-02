import "./index.css";
import { useT } from "@realthing/locales/react";
import { TooltipProvider } from "@realthing/ui/tooltip";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useLocaleSync } from "./i18n";
import { initNavigation } from "./navigation";
import { initFilesTreePersistence } from "./panels/filesTreeState";
import { initProjectExpansionPersistence } from "./panels/projectExpansion";
import { AppResourceHost } from "./shell/AppResourceHost";
import { Shell } from "./shell/Shell";
import { applyThemePreference, initializeThemes, readThemeHint } from "./themes";
import { initTransport } from "./transport";

initializeThemes();
applyThemePreference(readThemeHint());
initTransport();
initProjectExpansionPersistence();
initFilesTreePersistence();
initNavigation();

function App() {
	useLocaleSync();
	const t = useT();
	return (
		<ErrorBoundary label={t("app.errorBoundary.label")} reportId="app">
			<TooltipProvider delayDuration={250} skipDelayDuration={400}>
				<AppResourceHost>
					<Shell />
				</AppResourceHost>
			</TooltipProvider>
		</ErrorBoundary>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
