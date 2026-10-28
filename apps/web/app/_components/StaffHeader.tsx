import Link from "next/link";
import type { StaffUser } from "@repo/kyc";
import { LogoutButton } from "./LogoutButton";

export function StaffHeader({ user }: { user: StaffUser }) {
  return (
    <div className="staff-bar">
      <nav className="staff-links">
        {user.roles.includes("agent") && <Link href="/agent">Agent queue</Link>}
        {user.roles.includes("reviewer") && (
          <Link href="/reviewer">Review queue</Link>
        )}
      </nav>
      <div className="staff-user">
        <span>
          Signed in as <strong>{user.name}</strong>
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
