import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/Footer";
import { RoleAuthForm } from "@/components/auth/RoleAuthForm";

export const Route = createFileRoute("/professionals/login")({
  head: () => ({
    meta: [
      { title: "Professional Login — Shootbase" },
      { name: "description", content: "Sign in to your Shootbase professional account to access projects and grow your business." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProLogin,
});

function ProLogin() {
  return (
    <div className="bg-paper min-h-screen">
      <RoleAuthForm
        role="professional"
        mode="login"
        title="Professional"
        subtitle="Sign in to access projects, manage credits and grow your business."
        altHref="/professionals/signup"
        altLabel="New here? Join as a Professional"
      />
      <SiteFooter />
    </div>
  );
}
