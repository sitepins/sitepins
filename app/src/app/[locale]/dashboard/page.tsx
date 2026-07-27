import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Cloud deployments set NEXT_PUBLIC_DASHBOARD_HOME=/dashboard/overview
  // (a cloud-only page with subscription details).
  redirect(process.env.NEXT_PUBLIC_DASHBOARD_HOME || `/dashboard/account`);
}
