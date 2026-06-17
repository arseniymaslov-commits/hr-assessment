import { redirect } from "next/navigation";
import { defaultPathForRole, getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? defaultPathForRole(user.role) : "/login");
}
