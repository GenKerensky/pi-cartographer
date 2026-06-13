import type { DashboardSectionId, TopicWorkspaceTabId } from "@/features/review-workflow";
import type { DocumentKind } from "../shared/models.js";

export type DashboardPageId = DashboardSectionId;
export type DashboardTopicDocumentKind = Extract<DocumentKind, "proposal" | "requirements" | "design" | "plan">;

export const dashboardTopicDocumentKinds = ["proposal", "requirements", "design", "plan"] as const;

export function isDashboardTopicDocumentKind(kind: string | undefined): kind is DashboardTopicDocumentKind {
	return dashboardTopicDocumentKinds.includes(kind as DashboardTopicDocumentKind);
}

export type DashboardRouteDescriptor = {
	id: DashboardPageId;
	label: string;
	requiresTopic?: boolean;
	defaultDocumentKind?: DashboardTopicDocumentKind;
};

export const dashboardRouteDescriptors: DashboardRouteDescriptor[] = [
	{ id: "overview", label: "Overview" },
	{ id: "topics", label: "Topics" },
	{ id: "topic", label: "Topic", requiresTopic: true, defaultDocumentKind: "proposal" },
	{ id: "documents", label: "Documents", requiresTopic: true, defaultDocumentKind: "proposal" },
	{ id: "facts", label: "Facts", requiresTopic: true },
	{ id: "evidence", label: "Evidence", requiresTopic: true },
	{ id: "receipts", label: "Receipts", requiresTopic: true },
	{ id: "health", label: "Health", requiresTopic: true },
	{ id: "graph", label: "Graph", requiresTopic: true },
];

function encodeTopic(topicId: string): string {
	return encodeURIComponent(topicId);
}

export function routeDescriptor(page: DashboardPageId): DashboardRouteDescriptor {
	return dashboardRouteDescriptors.find((descriptor) => descriptor.id === page) ?? dashboardRouteDescriptors[0]!;
}

export function defaultDashboardNavHref(
	page: DashboardPageId,
	topicId?: string,
	documentKind: DashboardTopicDocumentKind = "proposal",
): string {
	if (page === "overview") return "/";
	if (page === "topics" || !topicId) return "/topics";
	const topicPath = `/topics/${encodeTopic(topicId)}`;
	if (page === "topic") return topicPath;
	if (page === "documents") return `${topicPath}/documents/${documentKind}`;
	return `${topicPath}/${page}`;
}

export type DashboardRouteLinkTarget =
	| { to: "/"; params?: undefined }
	| { to: "/topics"; params?: undefined }
	| { to: "/topics/$topic"; params: { topic: string } }
	| { to: "/topics/$topic/documents/$kind"; params: { topic: string; kind: DashboardTopicDocumentKind } }
	| { to: "/topics/$topic/facts"; params: { topic: string } }
	| { to: "/topics/$topic/evidence"; params: { topic: string } }
	| { to: "/topics/$topic/receipts"; params: { topic: string } }
	| { to: "/topics/$topic/health"; params: { topic: string } }
	| { to: "/topics/$topic/graph"; params: { topic: string } };

export function dashboardRouteLinkTarget(
	page: DashboardPageId,
	topicId?: string,
	documentKind: DashboardTopicDocumentKind = "proposal",
): DashboardRouteLinkTarget {
	if (page === "overview") return { to: "/" };
	if (page === "topics" || !topicId) return { to: "/topics" };
	if (page === "topic") return { to: "/topics/$topic", params: { topic: topicId } };
	if (page === "documents") return { to: "/topics/$topic/documents/$kind", params: { topic: topicId, kind: documentKind } };
	if (page === "facts") return { to: "/topics/$topic/facts", params: { topic: topicId } };
	if (page === "evidence") return { to: "/topics/$topic/evidence", params: { topic: topicId } };
	if (page === "receipts") return { to: "/topics/$topic/receipts", params: { topic: topicId } };
	if (page === "health") return { to: "/topics/$topic/health", params: { topic: topicId } };
	return { to: "/topics/$topic/graph", params: { topic: topicId } };
}

export function topicTabForPage(
	page: DashboardPageId,
	documentKind: DashboardTopicDocumentKind = "proposal",
): TopicWorkspaceTabId | undefined {
	if (page === "topic" || page === "documents") return documentKind;
	if (page === "facts" || page === "evidence" || page === "receipts" || page === "health" || page === "graph") return page;
	return undefined;
}
