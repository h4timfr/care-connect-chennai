/* eslint-disable @typescript-eslint/no-explicit-any -- Documented technical reason: Generic API returns and complex UI component mappings */
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: any): { redirect?: string; signup?: boolean } => {
    const params: { redirect?: string; signup?: boolean } = {};
    if (typeof search?.redirect === "string") {
      params.redirect = search.redirect;
    }
    if (search?.signup === true || search?.signup === "true") {
      params.signup = true;
    }
    return params;
  },
});

function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const [isSignUp, setIsSignUp] = useState(search.signup ?? false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const redirectUrl = search.redirect || "/";

  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: redirectUrl });
    }
  }, [user, authLoading, navigate, redirectUrl]);

  if (authLoading || user) {
    return <div className="min-h-screen bg-surface" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Account created! You can now log in.");
        setIsSignUp(false); // Switch back to login mode so they can log in
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Signed in successfully!");
        navigate({ to: "/" });
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm surface-card p-8 rounded-2xl shadow-sm border">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-display">CareConnect</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp ? "Create a new account" : "Sign in to your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="********"
            />
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Button type="submit" disabled={loading}>
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={loading}
            >
              {isSignUp ? "Back to Sign In" : "Create Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
