import { Redirect } from "expo-router";

// Native has no literal "/" URL to resolve (the Stack just mounts its
// initial route), but the web preview does - hitting bare "/" needs a
// real matching route. This redirects into the (auth) group, and the
// root layout's own auth-state redirect immediately bounces an already
// logged-in user on to (tabs)/feed.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
