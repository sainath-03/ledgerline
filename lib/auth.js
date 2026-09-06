import GoogleProvider from "next-auth/providers/google";
import { upsertUser, saveGmailAccount } from "@/lib/db";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    // Fires on every sign-in with the raw OAuth `account` payload.
    // Normal sign-in only ever requests the base profile/email scope;
    // the separate "Connect Gmail" button on the client requests the
    // same provider with an extra gmail.readonly scope and
    // prompt=consent (so Google is forced to hand back a
    // refresh_token). When that's what just happened, stash the
    // refresh token so the scan job can use it without the user being
    // present.
    async jwt({ token, account, user }) {
      const email = user?.email || token?.email;
      if (account?.refresh_token && email && account.scope?.includes("gmail.readonly")) {
        try {
          const expiresAt = account.expires_at ? new Date(account.expires_at * 1000) : null;
          await saveGmailAccount(email, account.refresh_token, account.access_token, expiresAt);
        } catch (e) {
          console.error("Failed to save Gmail account", e);
        }
      }
      return token;
    }
  },
  events: {
    // Keep a directory of everyone who has ever signed in — the
    // month-end cron loops over this table, independent of whether
    // someone has logged any expenses yet this month.
    async signIn({ user }) {
      if (user?.email) {
        try {
          await upsertUser(user.email, user.name, user.image);
        } catch (e) {
          console.error("Failed to record signed-in user", e);
        }
      }
    }
  }
};
