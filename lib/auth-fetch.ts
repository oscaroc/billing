"use client";

let redirecting = false;

export function signInUrl(returnTo: string) {
  return `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(returnTo)}`;
}

function redirectToSignIn() {
  if (redirecting || typeof window === "undefined") return;
  redirecting = true;
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(signInUrl(returnTo));
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  redirectToSignIn();
  // Keep the protected operation suspended while the browser leaves the page.
  // This prevents callers from replacing the redirect with an error toast.
  return new Promise<Response>(() => undefined);
}
