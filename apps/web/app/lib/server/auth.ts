import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { StaffUser } from "@repo/kyc";
import { requireEnv } from "./env";

const STAFF_COOKIE = "snapkyc_staff";
const CUSTOMER_COOKIE = "snapkyc_customer";
const STAFF_TTL_SECONDS = 8 * 60 * 60;
const CUSTOMER_TTL_SECONDS = 24 * 60 * 60;

// Hard-coded demo users, as allowed by the brief. lead1 has both roles so the
// maker-checker rule can be shown: lead1 may review calls, but not their own.
export const DEMO_USERS: (StaffUser & { username: string })[] = [
  { id: "agent1", username: "agent1", name: "Asha (Agent)", roles: ["agent"] },
  {
    id: "reviewer1",
    username: "reviewer1",
    name: "Meera (Reviewer)",
    roles: ["reviewer"],
  },
  {
    id: "lead1",
    username: "lead1",
    name: "Ravi (Agent + Reviewer)",
    roles: ["agent", "reviewer"],
  },
];

const DEMO_PASSWORD = "demo1234";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function findDemoUser(username: unknown, password: unknown) {
  if (typeof username !== "string" || password !== DEMO_PASSWORD) return null;
  const user = DEMO_USERS.find((u) => u.username === username.trim());
  return user ? { id: user.id, name: user.name, roles: user.roles } : null;
}

export async function setStaffCookie(user: StaffUser) {
  const token = jwt.sign({}, requireEnv("AUTH_SECRET"), {
    algorithm: "HS256",
    subject: user.id,
    audience: "staff",
    expiresIn: STAFF_TTL_SECONDS,
  });
  (await cookies()).set(STAFF_COOKIE, token, {
    ...cookieOptions,
    maxAge: STAFF_TTL_SECONDS,
  });
}

export async function clearStaffCookie() {
  (await cookies()).delete(STAFF_COOKIE);
}

export async function getStaff(): Promise<StaffUser | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = jwt.verify(token, requireEnv("AUTH_SECRET"), {
      algorithms: ["HS256"],
      audience: "staff",
    });
    if (typeof claims === "string") return null;
    // Roles come from the user list, not the cookie, so they are never stale.
    const user = DEMO_USERS.find((u) => u.id === claims.sub);
    return user ? { id: user.id, name: user.name, roles: user.roles } : null;
  } catch {
    return null;
  }
}

// The customer has no account: a signed cookie ties the browser to one session.
export async function setCustomerCookie(sessionId: string) {
  const token = jwt.sign({}, requireEnv("AUTH_SECRET"), {
    algorithm: "HS256",
    subject: sessionId,
    audience: "customer",
    expiresIn: CUSTOMER_TTL_SECONDS,
  });
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    ...cookieOptions,
    maxAge: CUSTOMER_TTL_SECONDS,
  });
}

export async function clearCustomerCookie() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}

export async function getCustomerSessionId(): Promise<string | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = jwt.verify(token, requireEnv("AUTH_SECRET"), {
      algorithms: ["HS256"],
      audience: "customer",
    });
    return typeof claims === "string" ? null : (claims.sub ?? null);
  } catch {
    return null;
  }
}
