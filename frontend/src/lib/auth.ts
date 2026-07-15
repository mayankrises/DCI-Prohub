export const MOCK_USERS = [
  { id: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", name: "Rahul Sharma",  email: "rahul@bpcl.in",  role: "reviewer",              initials: "RS" },
  { id: "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2", name: "Anita Verma",   email: "anita@bpcl.in",  role: "editor",                initials: "AV" },
  { id: "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3", name: "Vikram Singh",  email: "vikram@bpcl.in", role: "document_controller",   initials: "VS" },
  { id: "d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4", name: "Admin User",    email: "admin@bpcl.in",  role: "project_admin",         initials: "AD" },
];

export type MockUser = typeof MOCK_USERS[number];

export const ROLE_LABELS: Record<string, string> = {
  reviewer:             "Reviewer",
  editor:               "Editor",
  document_controller:  "Doc Controller",
  project_admin:        "Admin",
};

export const ROLE_COLORS: Record<string, string> = {
  reviewer:             "badge-gray",
  editor:               "badge-indigo",
  document_controller:  "badge-yellow",
  project_admin:        "badge-green",
};

export const PERMISSIONS: Record<string, string[]> = {
  upload_document:           ["editor", "document_controller", "project_admin"],
  view_document:             ["reviewer", "editor", "document_controller", "project_admin"],
  download_original:         ["reviewer", "editor", "document_controller", "project_admin"],
  add_annotation:            ["reviewer", "editor", "document_controller", "project_admin"],
  resolve_annotation:        ["reviewer", "editor", "document_controller", "project_admin"],
  delete_others_annotation:  ["document_controller", "project_admin"],
  release_lock:              ["document_controller", "project_admin"],
  create_group:              ["document_controller", "project_admin"],
  assign_task:               ["reviewer", "editor", "document_controller", "project_admin"],
  change_task_status:        ["reviewer", "editor", "document_controller", "project_admin"],
};

export function hasPermission(user: MockUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "project_admin") return true;
  return (PERMISSIONS[action] || []).includes(user.role);
}
