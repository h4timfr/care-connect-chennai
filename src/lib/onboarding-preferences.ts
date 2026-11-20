const decisions = new Set<string>();

export const LANGUAGE_WELCOME_KEY = "careconnect.welcome.language.v1";

export function hasOnboardingDecision(key: string) {
  if (decisions.has(key)) return true;
  try {
    return localStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}

export function rememberOnboardingDecision(key: string) {
  decisions.add(key);
  try {
    localStorage.setItem(key, "seen");
  } catch {
    // The decision still applies while this page session is open.
  }
}
