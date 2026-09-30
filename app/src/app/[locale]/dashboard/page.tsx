import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Deployments can point the dashboard home elsewhere via
  // NEXT_PUBLIC_DASHBOARD_HOME.
  redirect(process.env.NEXT_PUBLIC_DASHBOARD_HOME || `/dashboard/account`);
}
