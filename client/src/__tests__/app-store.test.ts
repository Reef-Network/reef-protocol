import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ensureAppsDir,
  installWellKnownApps,
  listInstalledApps,
  loadInstalledApp,
  loadAllInstalledApps,
  saveApp,
  removeApp,
  readAppMarkdown,
} from "../app-store.js";
import { parseAppMarkdown } from "../app-markdown.js";
import type { AppManifest } from "@reef-protocol/protocol";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reef-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ensureAppsDir", () => {
  it("creates the apps directory", () => {
    ensureAppsDir(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "apps"))).toBe(true);
  });

  it("is idempotent", () => {
    ensureAppsDir(tmpDir);
    ensureAppsDir(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "apps"))).toBe(true);
  });
});

describe("installWellKnownApps", () => {
  it("installs bundled apps as markdown files", () => {
    const installed = installWellKnownApps(tmpDir);
    expect(installed).toContain("tic-tac-toe");
    expect(fs.existsSync(path.join(tmpDir, "apps", "tic-tac-toe.md"))).toBe(
      true,
    );
  });

  it("overwrites existing files with bundled versions", () => {
    installWellKnownApps(tmpDir);

    // Modify the file
    const filePath = path.join(tmpDir, "apps", "tic-tac-toe.md");
    fs.writeFileSync(filePath, "custom content");

    // Install again — should overwrite with bundled version
    const installed = installWellKnownApps(tmpDir);
    expect(installed).toHaveLength(1);
    expect(fs.readFileSync(filePath, "utf-8")).not.toBe("custom content");
    expect(fs.readFileSync(filePath, "utf-8")).toContain("appId: tic-tac-toe");
  });

  it("copies the actual markdown file content", () => {
    installWellKnownApps(tmpDir);
    const raw = fs.readFileSync(
      path.join(tmpDir, "apps", "tic-tac-toe.md"),
      "utf-8",
    );
    expect(raw).toContain("appId: tic-tac-toe");
    expect(raw).toContain("# Tic-Tac-Toe");
  });
});

describe("listInstalledApps", () => {
  it("returns empty array for nonexistent dir", () => {
    expect(listInstalledApps(tmpDir)).toEqual([]);
  });

  it("lists installed app IDs sorted", () => {
    installWellKnownApps(tmpDir);
    const apps = listInstalledApps(tmpDir);
    expect(apps).toContain("tic-tac-toe");
  });
});

describe("loadInstalledApp", () => {
  it("returns null for nonexistent app", () => {
    expect(loadInstalledApp("nonexistent", tmpDir)).toBeNull();
  });

  it("loads and parses an installed app", () => {
    installWellKnownApps(tmpDir);
    const manifest = loadInstalledApp("tic-tac-toe", tmpDir);
    expect(manifest).not.toBeNull();
    expect(manifest!.appId).toBe("tic-tac-toe");
    expect(manifest!.type).toBe("p2p");
    expect(manifest!.actions.length).toBeGreaterThan(0);
  });

  it("returns null and warns for malformed app markdown", () => {
    ensureAppsDir(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, "apps", "bad-app.md"),
      "this is not valid frontmatter",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = loadInstalledApp("bad-app", tmpDir);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping malformed app "bad-app"'),
    );
    warnSpy.mockRestore();
  });
});

describe("loadAllInstalledApps", () => {
  it("returns empty array for empty dir", () => {
    expect(loadAllInstalledApps(tmpDir)).toEqual([]);
  });

  it("loads all installed apps", () => {
    installWellKnownApps(tmpDir);
    const manifests = loadAllInstalledApps(tmpDir);
    expect(manifests.length).toBeGreaterThan(0);
    expect(manifests[0].appId).toBe("tic-tac-toe");
  });

  it("skips malformed files and loads the rest", () => {
    installWellKnownApps(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, "apps", "broken.md"),
      "not valid frontmatter",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manifests = loadAllInstalledApps(tmpDir);
    expect(manifests.length).toBeGreaterThan(0);
    expect(manifests.some((m) => m.appId === "tic-tac-toe")).toBe(true);
    expect(manifests.some((m) => m.appId === "broken")).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("saveApp", () => {
  it("saves an app manifest as markdown", () => {
    const manifest: AppManifest = {
      appId: "test-app",
      name: "Test App",
      description: "A test",
      version: "1.0.0",
      type: "p2p",
      actions: [],
      minParticipants: 2,
    };

    saveApp(manifest, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "apps", "test-app.md"))).toBe(true);

    const loaded = loadInstalledApp("test-app", tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.appId).toBe("test-app");
  });
});

describe("removeApp", () => {
  it("removes an installed app", () => {
    installWellKnownApps(tmpDir);
    expect(removeApp("tic-tac-toe", tmpDir)).toBe(true);
    expect(loadInstalledApp("tic-tac-toe", tmpDir)).toBeNull();
  });

  it("returns false for nonexistent app", () => {
    expect(removeApp("nonexistent", tmpDir)).toBe(false);
  });
});

describe("readAppMarkdown", () => {
  it("returns null for nonexistent app", () => {
    expect(readAppMarkdown("nonexistent", tmpDir)).toBeNull();
  });

  it("returns raw markdown string", () => {
    installWellKnownApps(tmpDir);
    const raw = readAppMarkdown("tic-tac-toe", tmpDir);
    expect(raw).not.toBeNull();
    expect(raw).toContain("appId: tic-tac-toe");
    expect(raw).toContain("type: p2p");
  });

  it("round-trips: installed file can be parsed back", () => {
    installWellKnownApps(tmpDir);
    const raw = readAppMarkdown("tic-tac-toe", tmpDir);
    expect(raw).not.toBeNull();
    const manifest = parseAppMarkdown(raw!);
    expect(manifest.appId).toBe("tic-tac-toe");
    expect(manifest.type).toBe("p2p");
    expect(manifest.rules).toContain("# Tic-Tac-Toe");
  });
});
