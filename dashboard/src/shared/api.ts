import type { ApiError, ApiResponse, HealthIssue } from "./models.js";

export function apiSuccess<T>(data: T, warnings: HealthIssue[] = []): ApiResponse<T> {
	return { ok: true, data, warnings };
}

export function apiFailure(error: ApiError, warnings: HealthIssue[] = []): ApiResponse<never> {
	return { ok: false, error, warnings };
}
