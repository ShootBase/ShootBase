import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/Footer";
import { RoleAuthForm } from "@/components/auth/RoleAuthForm";

export const Route = createFileRoute("/client/login")({
  head: () => ({
    meta: [
      { title: "Client Login — Shootbase" },
      { name: "description", content: "Sign in to your Shootbase client account to manage jobs and quotes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientLogin,
});

function ClientLogin() {
  return (
    <div className="bg-paper min-h-screen">
      <RoleAuthForm
        role="customer"
        mode="login"
        title="Client"
        subtitle="Sign in to manage your jobs, receive quotes and communicate with professionals."
        altHref="/client/signup"
        altLabel="New here? Create an account"
      />
      <SiteFooter />
    </div>
  );
}
