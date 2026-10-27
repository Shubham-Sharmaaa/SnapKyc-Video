import { randomBytes } from "node:crypto";

// Fake SnapKYC provider. The real one asks the user to approve the request in
// the Aadhaar app and returns a signed response; this one returns a dummy
// person picked from the last digits of the number. Nothing here is real data.

const DUMMY_PEOPLE = [
  { name: "Aarav Sharma", dob: "1994-03-12", color: "#2563eb" },
  { name: "Diya Patel", dob: "1998-07-25", color: "#db2777" },
  { name: "Kabir Rao", dob: "1989-11-02", color: "#059669" },
  { name: "Ananya Iyer", dob: "2000-01-30", color: "#d97706" },
  { name: "Rohan Gupta", dob: "1992-05-18", color: "#7c3aed" },
];

export type SnapKycResult =
  | { ok: true; ref: string; name: string; dob: string; photo: string }
  | { ok: false; error: string };

function avatar(name: string, color: string) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">` +
    `<rect width="160" height="200" fill="${color}"/>` +
    `<circle cx="80" cy="78" r="38" fill="#ffffff" fill-opacity="0.85"/>` +
    `<rect x="26" y="126" width="108" height="74" rx="40" fill="#ffffff" fill-opacity="0.85"/>` +
    `<text x="80" y="90" font-family="sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="${color}">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function mockSnapKycLookup(idNumber: string): SnapKycResult {
  const digits = idNumber.replace(/[\s-]/g, "");
  // Real Aadhaar numbers are 12 digits and never start with 0 or 1.
  if (!/^[2-9]\d{11}$/.test(digits)) {
    return {
      ok: false,
      error: "Enter a 12-digit dummy Aadhaar number (it cannot start with 0 or 1)",
    };
  }
  // A predictable failure so the error path can be demoed.
  if (digits.endsWith("0000")) {
    return { ok: false, error: "The request was declined in the Aadhaar app (mock)" };
  }

  const person = DUMMY_PEOPLE[Number(digits.slice(-4)) % DUMMY_PEOPLE.length]!;
  return {
    ok: true,
    ref: `SNAPKYC-${randomBytes(6).toString("hex").toUpperCase()}`,
    name: person.name,
    dob: person.dob,
    photo: avatar(person.name, person.color),
  };
}
