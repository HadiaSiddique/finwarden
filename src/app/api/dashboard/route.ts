import { handler } from "@/server/http";
import { requireUser } from "@/server/session";
import { dashboardData } from "@/services/dashboard";

export const GET = handler(null, async () => {
  await requireUser();
  return dashboardData();
});
