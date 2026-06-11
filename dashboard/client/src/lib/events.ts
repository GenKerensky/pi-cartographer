import { useEffect, useState } from "react";
import { writeLatestLiveReloadEvent, writeLiveStatus } from "./dashboard-db.js";
import type { LiveReloadEvent, LiveReloadStatus } from "../../../shared/models.js";

export type LiveConnectionState = "connected" | "reconnecting" | "disconnected" | "manual-refresh";

export type LiveConnectionSnapshot = {
	state: LiveConnectionState;
	status?: LiveReloadStatus;
	lastEvent?: LiveReloadEvent;
};

export function useLiveConnection(enabled = true): LiveConnectionSnapshot {
	const [snapshot, setSnapshot] = useState<LiveConnectionSnapshot>({
		state: enabled ? "reconnecting" : "manual-refresh",
	});

	useEffect(() => {
		if (!enabled || typeof EventSource === "undefined") {
			setSnapshot({ state: "manual-refresh" });
			return undefined;
		}

		const source = new EventSource("/api/events");
		source.addEventListener("open", () => setSnapshot((current) => ({ ...current, state: "connected" })));
		source.addEventListener("error", () => setSnapshot((current) => ({ ...current, state: "reconnecting" })));
		source.addEventListener("status", (event) => {
			const status = JSON.parse((event as MessageEvent<string>).data) as LiveReloadStatus;
			writeLiveStatus(status);
			setSnapshot({ state: status.enabled ? "connected" : "manual-refresh", status });
		});
		source.addEventListener("reload", (event) => {
			const lastEvent = JSON.parse((event as MessageEvent<string>).data) as LiveReloadEvent;
			writeLatestLiveReloadEvent(lastEvent);
			setSnapshot((current) => ({ ...current, state: "connected", lastEvent }));
		});
		return () => {
			source.close();
			setSnapshot((current) => ({ ...current, state: "disconnected" }));
		};
	}, [enabled]);

	return snapshot;
}
