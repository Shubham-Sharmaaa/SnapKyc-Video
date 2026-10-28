import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canClaim,
  canDecide,
  canRecommend,
  isInIndia,
  type SessionFacts,
  type SessionStatus,
  type StaffUser,
} from "./rules";

const agent: StaffUser = { id: "agent1", name: "Agent", roles: ["agent"] };
const reviewer: StaffUser = { id: "reviewer1", name: "Reviewer", roles: ["reviewer"] };
const lead: StaffUser = { id: "lead1", name: "Lead", roles: ["agent", "reviewer"] };

function session(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    status: "pending_review",
    agent_id: "lead1",
    snapshot_path: "sessions/x/snapshot.jpg",
    recording_path: "sessions/x/recording.webm",
    ...overrides,
  };
}

describe("canDecide (maker-checker)", () => {
  it("blocks the agent who ran the call, even if they are also a reviewer", () => {
    const result = canDecide(session({ agent_id: "lead1" }), lead);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.httpStatus, 403);
    assert.match(!result.ok ? result.error : "", /maker-checker/i);
  });

  it("lets a different reviewer decide", () => {
    assert.deepEqual(canDecide(session({ agent_id: "lead1" }), reviewer), { ok: true });
  });

  it("lets a dual-role user review someone else's call", () => {
    assert.deepEqual(canDecide(session({ agent_id: "agent1" }), lead), { ok: true });
  });

  it("blocks users without the reviewer role", () => {
    const result = canDecide(session({ agent_id: "lead1" }), agent);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.httpStatus, 403);
  });

  for (const status of ["consented", "id_verified", "in_call", "approved", "rejected"] as SessionStatus[]) {
    it(`blocks a decision while the session is ${status}`, () => {
      const result = canDecide(session({ status, agent_id: "agent1" }), reviewer);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.httpStatus, 409);
    });
  }
});

describe("canRecommend", () => {
  const inCall = (overrides: Partial<SessionFacts> = {}) =>
    session({ status: "in_call", agent_id: "agent1", ...overrides });

  it("allows the call's agent once snapshot and recording are saved", () => {
    assert.deepEqual(canRecommend(inCall(), agent), { ok: true });
  });

  it("requires a face snapshot", () => {
    assert.equal(canRecommend(inCall({ snapshot_path: null }), agent).ok, false);
  });

  it("requires a saved recording", () => {
    assert.equal(canRecommend(inCall({ recording_path: null }), agent).ok, false);
  });

  it("blocks another agent", () => {
    const other: StaffUser = { id: "agent2", name: "Other", roles: ["agent"] };
    assert.equal(canRecommend(inCall(), other).ok, false);
  });
});

describe("canClaim", () => {
  it("lets an agent take a waiting customer", () => {
    assert.deepEqual(canClaim(session({ status: "id_verified", agent_id: null }), agent), {
      ok: true,
    });
  });

  it("blocks a reviewer-only user", () => {
    assert.equal(canClaim(session({ status: "id_verified", agent_id: null }), reviewer).ok, false);
  });

  it("blocks taking a call another agent already has", () => {
    assert.equal(canClaim(session({ status: "in_call", agent_id: "lead1" }), agent).ok, false);
  });
});

describe("isInIndia", () => {
  it("accepts Bengaluru", () => assert.equal(isInIndia(12.9716, 77.5946), true));
  it("rejects London", () => assert.equal(isInIndia(51.5072, -0.1276), false));
});
