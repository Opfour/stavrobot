import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Pool, QueryResult } from "pg";

// Mock config and log dependencies so the module loads without real infrastructure.
vi.mock("./config.js", () => ({
  loadPostgresConfig: vi.fn().mockReturnValue({}),
  OWNER_CHANNELS: [],
}));
vi.mock("./log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./toon.js", () => ({
  encodeToToon: vi.fn(),
}));

import { resolveInterlocutor, seedOwner } from "./database.js";
import type { OwnerConfig } from "./config.js";

// Seed the owner so getOwnerInterlocutorId() doesn't throw. The mock pool
// returns a stable owner ID of 42 for all tests in this file.
const OWNER_ID = 42;

beforeAll(async () => {
  const seedPool = {
    query: vi.fn().mockImplementation((text: string) => {
      if (typeof text === "string" && text.includes("INSERT INTO agents")) {
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 } as unknown as QueryResult);
      }
      if (typeof text === "string" && text.includes("SELECT id FROM interlocutors WHERE owner")) {
        return Promise.resolve({ rows: [{ id: OWNER_ID }], rowCount: 1 } as unknown as QueryResult);
      }
      return Promise.resolve({ rows: [], rowCount: 0 } as unknown as QueryResult);
    }),
  } as unknown as Pool;
  const ownerConfig: OwnerConfig = { name: "Test Owner" };
  await seedOwner(seedPool, ownerConfig);
});

function makeMockPool(queryImpl: (text: string, values?: unknown[]) => Promise<QueryResult>): Pool {
  return {
    query: vi.fn().mockImplementation(queryImpl),
  } as unknown as Pool;
}

describe("resolveInterlocutor — email wildcard matching", () => {
  it("matches a wildcard pattern *@example.com against user@example.com", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 1,
            identity_id: 10,
            agent_id: 5,
            display_name: "Example Corp",
            identifier: "*@example.com",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "user@example.com");
    expect(result).not.toBeNull();
    expect(result?.interlocutorId).toBe(1);
    expect(result?.identityId).toBe(10);
    expect(result?.agentId).toBe(5);
    expect(result?.displayName).toBe("Example Corp");
  });

  it("does not match *@example.com against user@other.com", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 1,
            identity_id: 10,
            agent_id: 5,
            display_name: "Example Corp",
            identifier: "*@example.com",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    // The SQL LIKE filter already excludes this, but we simulate a row being returned
    // to verify the application-level matchesEmailEntry check also rejects it.
    const result = await resolveInterlocutor(pool, "email", "user@other.com");
    expect(result).toBeNull();
  });

  it("matches an exact email address", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 2,
            identity_id: 20,
            agent_id: 7,
            display_name: "Alice",
            identifier: "alice@example.com",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "alice@example.com");
    expect(result).not.toBeNull();
    expect(result?.interlocutorId).toBe(2);
  });

  it("returns null when no rows match the domain filter", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({ rows: [], rowCount: 0 } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "nobody@nowhere.com");
    expect(result).toBeNull();
  });

  it("returns null when the matched interlocutor has no agent_id", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 3,
            identity_id: 30,
            agent_id: null,
            display_name: "Unassigned",
            identifier: "*@example.com",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "user@example.com");
    expect(result).toBeNull();
  });

  it("uses the first matching row when multiple identities match", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 4,
            identity_id: 40,
            agent_id: 8,
            display_name: "First",
            identifier: "*@example.com",
          },
          {
            interlocutor_id: 5,
            identity_id: 50,
            agent_id: 9,
            display_name: "Second",
            identifier: "user@example.com",
          },
        ],
        rowCount: 2,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "user@example.com");
    expect(result?.interlocutorId).toBe(4);
  });

  it("passes the domain as the SQL parameter", async () => {
    let capturedValues: unknown[] | undefined;
    const pool = makeMockPool((_, values) => {
      capturedValues = values;
      return Promise.resolve({ rows: [], rowCount: 0 } as unknown as QueryResult);
    });
    await resolveInterlocutor(pool, "email", "sender@mail.example.com");
    expect(capturedValues).toEqual(["mail.example.com"]);
  });

  it("is case-insensitive when matching email patterns", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 6,
            identity_id: 60,
            agent_id: 11,
            display_name: "Case Test",
            identifier: "*@example.com",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "email", "User@EXAMPLE.COM");
    expect(result).not.toBeNull();
    expect(result?.interlocutorId).toBe(6);
  });
});

describe("resolveInterlocutor — non-email services (exact match)", () => {
  it("returns the interlocutor for an exact signal match", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 7,
            identity_id: 70,
            agent_id: 12,
            display_name: "Signal User",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "signal", "+1234567890");
    expect(result).not.toBeNull();
    expect(result?.interlocutorId).toBe(7);
  });

  it("returns null when no signal identity matches", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({ rows: [], rowCount: 0 } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "signal", "+9999999999");
    expect(result).toBeNull();
  });

  it("returns null when the signal interlocutor has no agent_id", async () => {
    const pool = makeMockPool(() =>
      Promise.resolve({
        rows: [
          {
            interlocutor_id: 8,
            identity_id: 80,
            agent_id: null,
            display_name: "No Agent",
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult),
    );
    const result = await resolveInterlocutor(pool, "signal", "+1234567890");
    expect(result).toBeNull();
  });
});
