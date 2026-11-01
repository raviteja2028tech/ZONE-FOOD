import bcrypt from "bcryptjs";

/** bcrypt cost 12, matching the seeded demo hashes. Plain passwords never leave this module. */
const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * A real bcrypt hash of a random value, computed once. Comparing against it when the e-mail is unknown
 * makes "no such user" take as long as "wrong password", so response time does not reveal which e-mails exist.
 */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= bcrypt.hash(`dummy-${Math.random()}-${Date.now()}`, COST));
