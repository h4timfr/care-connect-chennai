import { createFileRoute, redirect } from "@tanstack/react-router";

// Sign-up lives on /login (?signup=true); /signup is kept as a shareable alias.
export const Route = createFileRoute("/signup")({
  beforeLoad: ({ search }) => {
    const target = (search as Record<string, unknown>)["redirect"];
    throw redirect({
      to: "/login",
      search: typeof target === "string" ? { signup: true, redirect: target } : { signup: true },
      replace: true,
    });
  },
});
