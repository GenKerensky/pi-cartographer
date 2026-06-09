import { promises as fs } from "node:fs";
import path from "node:path";

export type PathSafetyCode = "missing-root" | "outside-root" | "private-path" | "not-a-file";

export class PathSafetyError extends Error {
	readonly code: PathSafetyCode;
	readonly root: string;
	readonly requestedPath: string;
	readonly relativePath?: string;

	constructor(options: {
		code: PathSafetyCode;
		message: string;
		root: string;
		requestedPath: string;
		relativePath?: string;
	}) {
		super(options.message);
		this.name = "PathSafetyError";
		this.code = options.code;
		this.root = options.root;
		this.requestedPath = options.requestedPath;
		this.relativePath = options.relativePath;
	}
}

export type SafePath = {
	root: string;
	absolutePath: string;
	relativePath: string;
};

export type SafePathOptions = {
	mustExist?: boolean;
	allowDirectory?: boolean;
};

function isInsideRoot(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeSegments(relativePath: string): string[] {
	return relativePath.split(/[\\/]+/).filter(Boolean);
}

export function isPrivatePlanPath(relativePath: string): boolean {
	const segments = relativeSegments(relativePath);
	for (let index = 0; index < segments.length - 1; index += 1) {
		if (segments[index] === ".plan" && segments[index + 1] === "_private") return true;
	}
	return false;
}

export async function canonicalizeRoot(root: string): Promise<string> {
	const requestedRoot = path.resolve(root);
	try {
		const stat = await fs.stat(requestedRoot);
		if (!stat.isDirectory()) {
			throw new PathSafetyError({
				code: "missing-root",
				message: `Selected root is not a directory: ${requestedRoot}`,
				root: requestedRoot,
				requestedPath: root,
			});
		}
		return await fs.realpath(requestedRoot);
	} catch (error) {
		if (error instanceof PathSafetyError) throw error;
		throw new PathSafetyError({
			code: "missing-root",
			message: `Selected root is not readable: ${requestedRoot}`,
			root: requestedRoot,
			requestedPath: root,
		});
	}
}

export async function resolveSafePath(
	root: string,
	requestedPath: string,
	options: SafePathOptions = {},
): Promise<SafePath> {
	const safeRoot = await canonicalizeRoot(root);
	const lexicalTarget = path.resolve(
		safeRoot,
		path.isAbsolute(requestedPath) ? path.relative(safeRoot, requestedPath) : requestedPath,
	);
	if (!isInsideRoot(safeRoot, lexicalTarget)) {
		throw new PathSafetyError({
			code: "outside-root",
			message: `Path escapes selected root: ${requestedPath}`,
			root: safeRoot,
			requestedPath,
		});
	}

	const lexicalRelative = path.relative(safeRoot, lexicalTarget) || ".";
	if (isPrivatePlanPath(lexicalRelative)) {
		throw new PathSafetyError({
			code: "private-path",
			message: "Reads from .plan/_private are blocked",
			root: safeRoot,
			requestedPath,
			relativePath: lexicalRelative,
		});
	}

	let absolutePath = lexicalTarget;
	try {
		absolutePath = await fs.realpath(lexicalTarget);
	} catch (error) {
		if (options.mustExist === true) {
			throw error;
		}
	}

	if (!isInsideRoot(safeRoot, absolutePath)) {
		throw new PathSafetyError({
			code: "outside-root",
			message: `Resolved path escapes selected root: ${requestedPath}`,
			root: safeRoot,
			requestedPath,
		});
	}

	const relativePath = path.relative(safeRoot, absolutePath) || ".";
	if (isPrivatePlanPath(relativePath)) {
		throw new PathSafetyError({
			code: "private-path",
			message: "Reads from .plan/_private are blocked",
			root: safeRoot,
			requestedPath,
			relativePath,
		});
	}

	if (options.mustExist === true && options.allowDirectory !== true) {
		const stat = await fs.stat(absolutePath);
		if (!stat.isFile()) {
			throw new PathSafetyError({
				code: "not-a-file",
				message: `Path is not a file: ${requestedPath}`,
				root: safeRoot,
				requestedPath,
				relativePath,
			});
		}
	}

	return { root: safeRoot, absolutePath, relativePath };
}

export async function safeReadTextFile(
	root: string,
	requestedPath: string,
): Promise<{
	root: string;
	absolutePath: string;
	relativePath: string;
	content: string;
}> {
	const safePath = await resolveSafePath(root, requestedPath, { mustExist: true });
	const content = await fs.readFile(safePath.absolutePath, "utf8");
	return { ...safePath, content };
}

export async function safeReadDirectory(
	root: string,
	requestedPath: string,
): Promise<{
	root: string;
	absolutePath: string;
	relativePath: string;
	entries: import("node:fs").Dirent[];
}> {
	const safePath = await resolveSafePath(root, requestedPath, {
		mustExist: true,
		allowDirectory: true,
	});
	const stat = await fs.stat(safePath.absolutePath);
	if (!stat.isDirectory()) {
		throw new PathSafetyError({
			code: "not-a-file",
			message: `Path is not a directory: ${requestedPath}`,
			root: safePath.root,
			requestedPath,
			relativePath: safePath.relativePath,
		});
	}
	const entries = await fs.readdir(safePath.absolutePath, { withFileTypes: true });
	return { ...safePath, entries };
}
