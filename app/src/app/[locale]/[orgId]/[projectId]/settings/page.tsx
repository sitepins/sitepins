import { redirect } from "next/navigation";

export default async function SettingsPage(props: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const params = await props.params;
  redirect(`/${params.orgId}/${params.projectId}/settings/general`);
}
