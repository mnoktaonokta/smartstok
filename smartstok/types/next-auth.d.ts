import type { DefaultSession } from "next-auth";

export type UserRole = "ADMIN" | "MUHASEBE" | "DEPO" | "SAHA" | "OBSERVER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: UserRole[];
      forcePasswordChange: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    roles: UserRole[];
    forcePasswordChange: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: UserRole[];
    forcePasswordChange: boolean;
  }
}
