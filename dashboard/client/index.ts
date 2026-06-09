import type { DashboardOverview } from "../shared/models.js";

export type DashboardClientState = {
	overview?: DashboardOverview;
	selectedTopic?: string;
};

export function createInitialDashboardState(): DashboardClientState {
	return {};
}
