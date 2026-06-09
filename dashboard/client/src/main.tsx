import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardShell } from "./App.js";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element for dashboard client");

createRoot(rootElement).render(
	<StrictMode>
		<DashboardShell />
	</StrictMode>,
);
