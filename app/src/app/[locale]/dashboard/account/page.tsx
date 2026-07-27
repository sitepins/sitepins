import Container from "@/components/container";
import { getAuth, getListAccounts } from "@/lib/auth/auth-server";
import { redirect } from "next/navigation";
import UserAvatar from "./_components/user-avatar";
import UpdatePassword from "./_components/change-password-form";
import DeleteAccount from "./_components/delete-account";
import { ScrollToHash } from "./_components/scroll-to-hash";
import SetNewPassword from "./_components/set-password-form";
import UpdateNewsletterSubscription from "./_components/update-newsletter";
import UserDetailsForm from "./_components/update-profile-form";

export default async function Account() {
  const [auth, accounts] = await Promise.all([getAuth(), getListAccounts()]);

  if (!auth) {
    redirect(`/login?from=${encodeURIComponent("/account")}`);
  }

  let hasPassword = false;

  if (accounts) {
    hasPassword = accounts.some(
      (account: { providerId: string }) => account.providerId === "credential",
    );
  }

  return (
    <Container>
      <ScrollToHash />
      <UserAvatar auth={auth} />
      <UserDetailsForm auth={auth} />
      {hasPassword ? <UpdatePassword /> : <SetNewPassword />}
      <UpdateNewsletterSubscription auth={auth} />
      <DeleteAccount auth={auth} />
    </Container>
  );
}
