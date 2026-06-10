import { describe, expect, it } from "vitest";
import { readTopicArtifacts } from "../../dashboard/server/artifact-reader.ts";
import {
	createReferenceIndex,
	extractReferenceTokens,
	resolveReference,
} from "../../dashboard/client/src/lib/reference-resolver.js";
import { createDashboardFixture } from "./fixtures.ts";

describe("dashboard reference resolver", () => {
	it("resolves canonical and short fact references plus phase references", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);

		expect(resolveReference("F001", index)).toMatchObject({ status: "resolved", kind: "fact", id: "F001" });
		expect(resolveReference("F1", index)).toMatchObject({ status: "resolved", kind: "fact", id: "F001" });
		expect(resolveReference("phase:P0", index)).toMatchObject({ status: "resolved", kind: "phase", id: "phase:P0" });
	});

	it("reports broken and blocked references without leaking private paths", async () => {
		const fixture = createDashboardFixture();
		const artifacts = await readTopicArtifacts(fixture.root, fixture.topic);
		const index = createReferenceIndex(artifacts);

		expect(resolveReference("F999", index)).toMatchObject({ status: "missing", kind: "fact" });
		const blocked = resolveReference(`.plan/_private/${fixture.topic}/raw.log`, index);
		expect(blocked.status).toBe("blocked");
		expect(blocked.message).not.toContain("raw.log");
	});

	it("extracts Markdown reference tokens", () => {
		expect(
			extractReferenceTokens("Uses [F001], [S001], phase:P0, task:P0.T1, validation:P0.V1, and ADR-0001."),
		).toEqual(["F001", "S001", "phase:P0", "task:P0.T1", "validation:P0.V1", "ADR-0001"]);
	});
});
