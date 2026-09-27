import fs from "fs";
import os from "os";
import path from "path";

import { describe, it, expect, afterEach } from "vitest";
import { isGitUrlSchemeAllowed, isEditable, migrateGitInstalledMarkers } from "./plugin-lifecycle.js";
import { GIT_INSTALLED_DIR_NAME, GIT_INSTALLED_TEMP_DIR_NAME } from "./bundle-registry.js";

const tempDirs: string[] = [];

function makePluginsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-runner-test-"));
  tempDirs.push(dir);
  return dir;
}

function markerDir(pluginsDir: string): string {
  return path.join(pluginsDir, GIT_INSTALLED_DIR_NAME);
}

function tempMarkerDir(pluginsDir: string): string {
  return path.join(pluginsDir, GIT_INSTALLED_TEMP_DIR_NAME);
}

function writeMarker(pluginsDir: string, pluginName: string): void {
  fs.mkdirSync(markerDir(pluginsDir), { recursive: true });
  fs.writeFileSync(path.join(markerDir(pluginsDir), pluginName), "");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("isEditable", () => {
  it("treats a plugin without a marker as editable", () => {
    const pluginsDir = makePluginsDir();
    expect(isEditable("my-plugin", pluginsDir)).toBe(true);
  });

  it("treats a plugin with a marker as non-editable", () => {
    const pluginsDir = makePluginsDir();
    writeMarker(pluginsDir, "my-plugin");
    expect(isEditable("my-plugin", pluginsDir)).toBe(false);
  });

  it("stays editable when a .git directory exists but there is no marker", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(path.join(pluginsDir, "my-plugin", ".git"), { recursive: true });
    expect(isEditable("my-plugin", pluginsDir)).toBe(true);
  });
});

describe("migrateGitInstalledMarkers", () => {
  it("creates the marker directory and marks plugins that have a .git directory", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(path.join(pluginsDir, "git-plugin", ".git"), { recursive: true });
    fs.mkdirSync(path.join(pluginsDir, "local-plugin"), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(path.join(markerDir(pluginsDir), "git-plugin"))).toBe(true);
    expect(fs.existsSync(path.join(markerDir(pluginsDir), "local-plugin"))).toBe(false);
  });

  it("skips temp install directories", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(path.join(pluginsDir, ".tmp-install-abc", ".git"), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(path.join(markerDir(pluginsDir), ".tmp-install-abc"))).toBe(false);
  });

  it("does not re-scan when the marker directory already exists", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(markerDir(pluginsDir), { recursive: true });
    // Simulate a plugin the coder ran `git init` in after the migration ran.
    fs.mkdirSync(path.join(pluginsDir, "local-plugin", ".git"), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(path.join(markerDir(pluginsDir), "local-plugin"))).toBe(false);
  });

  it("does not leave the temporary marker directory behind", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(path.join(pluginsDir, "git-plugin", ".git"), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(tempMarkerDir(pluginsDir))).toBe(false);
    expect(fs.existsSync(path.join(markerDir(pluginsDir), "git-plugin"))).toBe(true);
  });

  it("removes a leftover temp directory from a crashed run before migrating", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(tempMarkerDir(pluginsDir), { recursive: true });
    fs.writeFileSync(path.join(tempMarkerDir(pluginsDir), "junk"), "");
    fs.mkdirSync(path.join(pluginsDir, "git-plugin", ".git"), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(tempMarkerDir(pluginsDir))).toBe(false);
    expect(fs.existsSync(path.join(markerDir(pluginsDir), "git-plugin"))).toBe(true);
  });

  it("removes a leftover temp directory even when the marker directory already exists", () => {
    const pluginsDir = makePluginsDir();
    fs.mkdirSync(markerDir(pluginsDir), { recursive: true });
    fs.mkdirSync(tempMarkerDir(pluginsDir), { recursive: true });

    migrateGitInstalledMarkers(pluginsDir);

    expect(fs.existsSync(tempMarkerDir(pluginsDir))).toBe(false);
  });
});

describe("isGitUrlSchemeAllowed", () => {
  it("allows https:// URLs", () => {
    expect(isGitUrlSchemeAllowed("https://github.com/user/repo.git")).toBe(true);
  });

  it("allows http:// URLs", () => {
    expect(isGitUrlSchemeAllowed("http://example.com/repo.git")).toBe(true);
  });

  it("allows git:// URLs", () => {
    expect(isGitUrlSchemeAllowed("git://github.com/user/repo.git")).toBe(true);
  });

  it("allows ssh:// URLs", () => {
    expect(isGitUrlSchemeAllowed("ssh://git@github.com/user/repo.git")).toBe(true);
  });

  it("allows git@ SCP-style SSH URLs", () => {
    expect(isGitUrlSchemeAllowed("git@github.com:user/repo.git")).toBe(true);
  });

  it("rejects ext:: URLs (arbitrary command execution)", () => {
    expect(isGitUrlSchemeAllowed("ext::sh -c 'id >/tmp/pwned'")).toBe(false);
  });

  it("rejects file:// URLs", () => {
    expect(isGitUrlSchemeAllowed("file:///etc/passwd")).toBe(false);
  });

  it("rejects bare paths", () => {
    expect(isGitUrlSchemeAllowed("/tmp/repo")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isGitUrlSchemeAllowed("")).toBe(false);
  });

  it("rejects URLs with no scheme", () => {
    expect(isGitUrlSchemeAllowed("github.com/user/repo")).toBe(false);
  });
});
