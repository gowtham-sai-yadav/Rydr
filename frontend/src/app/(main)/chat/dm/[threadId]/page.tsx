import DMThreadPage from "./PageClient";

// Static-export requires generateStaticParams on every dynamic segment.
// This route's data (a DM thread id) is fetched client-side at runtime,
// not known at build time, so this returns no pre-rendered paths - the
// client component resolves the id via `use(params)` once loaded.
// output: export requires at least one static path per dynamic
// route (an empty array is rejected outright). The value here is a
// placeholder only - every one of these pages is "use client" and
// fetches its real data after hydration via `use(params)` reading
// the actual browser URL, not this build-time value. Real in-app
// navigation goes through Next's client router (<Link>/router.push),
// which never touches the filesystem, so this placeholder is only
// ever served on a cold load of this exact literal URL.
export function generateStaticParams() {
  return [{ threadId: "placeholder" }];
}

export default function Page({ params }: { params: Promise<{ threadId: string }> }) {
  return <DMThreadPage params={params} />;
}
