/**
 * A personnel record from כ"א. Existing in this list does not imply a
 * person is scheduled/active on any given date — that's derived later from
 * actual assignments, never stored as a flag here.
 */
export interface Person {
  id: string;
  name: string;
  email: string | null;
  isManager: boolean;
  isTechnician: boolean;
  isSupervisor: boolean;
  personnelType: string | null;
  /** "YYYY-MM-DD", from כ"א -- null when the sheet has no discharge date for this person. */
  dischargeDate: string | null;
  /** "YYYY-MM-DD", from כ"א -- null when the sheet has no enlistment date for this person. */
  enlistmentDate: string | null;
}
