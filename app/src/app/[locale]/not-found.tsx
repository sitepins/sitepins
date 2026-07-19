"use client";

import SimpleHeader from "@/layouts/partials/simple-header";
import { authClient } from "@/lib/auth/auth-client";
import { useTranslations } from "next-intl";
import Link from "next/link";

const NotFound = () => {
  const { data: auth } = authClient.useSession();
  const tNotFound = useTranslations("not-found");

  return (
    <main>
      <SimpleHeader auth={auth} />
      <section className="flex min-h-[calc(100vh-80px)] items-center justify-center">
        <div className="mx-auto max-w-125 text-center">
          <h1 className="text-primary mb-4 text-4xl font-bold">
            {tNotFound("not_found")}
          </h1>
          <p className="text-text-dark mb-8 text-lg">
            {tNotFound("not_found_description")}
          </p>
          <Link
            href="/"
            className="bg-primary hover:bg-primary/90 inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium text-white transition-colors"
          >
            {tNotFound("go_home")}
          </Link>
        </div>
      </section>
    </main>
  );
};

export default NotFound;
