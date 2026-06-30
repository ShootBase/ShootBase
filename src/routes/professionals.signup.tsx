import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site/Footer";
import { RoleAuthForm } from "@/components/auth/RoleAuthForm";

export const Route = createFileRoute("/professionals/signup")({
  head: () => ({
    meta: [
      { title: "Join as a Professional — Shootbase" },
      { name: "description", content: "Create a Shootbase professional account to receive client projects across the UK." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProSignup,
});

function ProSignup() {
  return (
    <div className="bg-paper min-h-screen">
      <RoleAuthForm
        role="professional"
        mode="signup"
        title="Join as a Professional"
        subtitle="Find new clients, unlock projects, and grow your business."
        altHref="/professionals/login"
        altLabel="Already have an account? Login"
      />
      <SiteFooter />
    </div>
  );
}
