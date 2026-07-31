import type { WorkspaceCreatePayload } from "@/lib/create-workspace/types";

export type WorkspaceCreateResponse = {
  businessId: string;
  templateId: string;
  activeTemplateId: string;
  selectedTier: string;
  selectedTierName: string;
  template: {
    id: string;
    name: string;
    businessName: string | null;
    savedAt: string;
    bundleId: string;
    bundleName: string;
    description: string | null;
  };
};

export async function submitWorkspaceCreate(
  payload: WorkspaceCreatePayload
): Promise<WorkspaceCreateResponse> {
  const res = await fetch("/api/workspace/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : `Failed to create workspace (${res.status})`
    );
  }
  return data as WorkspaceCreateResponse;
}
