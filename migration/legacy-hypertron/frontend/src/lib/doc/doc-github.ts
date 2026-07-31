/** Monorepo root on GitHub (main branch). */
export const GITHUB_REPO = "https://github.com/karar189/hypertron";

export function githubTree(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${GITHUB_REPO}/tree/main/${clean}`;
}

export function githubBlob(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${GITHUB_REPO}/blob/main/${clean}`;
}
