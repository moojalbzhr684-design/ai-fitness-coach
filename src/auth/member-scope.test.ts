import { describe, expect, it } from "vitest";
import { GymRole } from "../generated/prisma/client.js";
import { resolveMemberGymScope } from "./member-scope.js";

function auth(memberships: Array<{ gymId: string; role: GymRole }>) {
  return { session: { user: { gymMemberships: memberships } } } as never;
}

describe("member tenant scope", () => {
  it("ignores staff roles and blocks a foreign gym selection", () => {
    const actor = auth([{ gymId: "gym-a", role: GymRole.MEMBER }, { gymId: "gym-b", role: GymRole.TRAINER }]);
    expect(resolveMemberGymScope(actor)).toMatchObject({ gymId: "gym-a" });
    expect(() => resolveMemberGymScope(actor, "gym-b")).toThrow();
  });

  it("requires explicit selection for multiple member gyms", () => {
    const actor = auth([{ gymId: "gym-a", role: GymRole.MEMBER }, { gymId: "gym-b", role: GymRole.MEMBER }]);
    expect(() => resolveMemberGymScope(actor)).toThrow();
    expect(resolveMemberGymScope(actor, "gym-b")).toMatchObject({ gymId: "gym-b" });
  });
});
