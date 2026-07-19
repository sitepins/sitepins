import { redirect } from "next/navigation";

export default async function Settings(props: {
  params: Promise<{ orgId: string }>;
}) {
  const params = await props.params;
  redirect(`/${params.orgId}/settings/general`);
}
