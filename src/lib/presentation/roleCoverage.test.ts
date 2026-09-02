import { describe, expect, it } from "vitest";
import { inRoleDisplayOrder } from "./roleCoverage";

describe('inRoleDisplayOrder -- the single shared אחמ"ש-before-טכנאי presentation order', () => {
  it("returns [supervisors, technicians], regardless of the property order on the input object", () => {
    const [supervisors, technicians] = inRoleDisplayOrder({ technicians: "tech-value", supervisors: "sup-value" });
    expect(supervisors).toBe("sup-value");
    expect(technicians).toBe("tech-value");
  });

  it("passes each value through completely unchanged -- ordering only, never a content transformation", () => {
    const supervisorPeople = [{ name: "איתי אוליר" }];
    const technicianPeople = [{ name: "גדעון פולין" }];
    const [supervisors, technicians] = inRoleDisplayOrder({ supervisors: supervisorPeople, technicians: technicianPeople });
    expect(supervisors).toBe(supervisorPeople); // same reference -- never copied/mutated
    expect(technicians).toBe(technicianPeople);
  });

  it("works for any shape sharing the {supervisors, technicians} keys -- name lists, staffing views, or anything else", () => {
    const [shadowSupervisorNames, shadowTechnicianNames] = inRoleDisplayOrder({
      supervisors: ["נועה דוגמה"],
      technicians: ["דני בדיקה"],
    });
    expect(shadowSupervisorNames).toEqual(["נועה דוגמה"]);
    expect(shadowTechnicianNames).toEqual(["דני בדיקה"]);
  });
});
