import GoogleProvider from "next-auth/providers/google";
import { upsertUser } from "@/lib/db";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  session: { strategy: "jwt" },
  trustHost: true,
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
