import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/Footer";
import { RoleAuthForm } from "@/components/auth/RoleAuthForm";

export const Route = createFileRoute("/client/signup")({
  head: () => ({
    meta: [
      { title: "Create Client Account — Shootbase" },
      { name: "description", content: "Create a Shootbase client account to post jobs and book trusted professionals." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientSignup,
});

function ClientSignup() {
  return (
    <div className="bg-paper min-h-screen">
      <RoleAuthForm
        role="customer"
        mode="signup"
        title="Create Client Account"
        subtitle="Post jobs, receive quotes, and hire trusted professionals."
        altHref="/client/login"
        altLabel="Already have an account? Login"
      />
      <SiteFooter />
    </div>
  );
}
