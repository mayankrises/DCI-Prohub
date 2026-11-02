export const MOCK_USERS = [
  { id: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1", name: "Rahul Sharma",  email: "rahul@bpcl.in",  role: "reviewer",              initials: "RS" },
  { id: "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2", name: "Anita Verma",   email: "anita@bpcl.in",  role: "editor",                initials: "AV" },
  { id: "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3", name: "Vikram Singh",  email: "vikram@bpcl.in", role: "document_controller",   initials: "VS" },
  { id: "d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4", name: "Admin User",    email: "admin@bpcl.in",  role: "project_admin",         initials: "AD", organisation: "Owner" },
  { id: "e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5", name: "Arjun Mehta", email: "arjun@contractor.test", role: "contractor_reviewer", initials: "AM", organisation: "Contractor" },
  { id: "f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6", name: "Neha Kapoor", email: "neha@consultant.test", role: "consultant_engineer", initials: "NK", organisation: "Consultant" },
  { id: "11111111-2222-3333-4444-555555555555", name: "Priya Nair", email: "priya@contractor.test", role: "contractor_controller", initials: "PN", organisation: "Contractor" },
  { id: "66666666-7777-8888-9999-000000000000", name: "Rahul Verma", email: "rahul@consultant.test", role: "consultant_controller", initials: "RV", organisation: "Consultant" },
];

export type MockUser = typeof MOCK_USERS[number];

export const ROLE_LABELS: Record<string, string> = {
  reviewer:             "Reviewer",
  editor:               "Editor",
  document_controller:  "Doc Controller",
  project_admin:        "Admin",
  contractor_reviewer:  "Contractor Reviewer",
  consultant_engineer:  "Consultant Engineer",
  contractor_controller:"Contractor Doc Controller",
  consultant_controller:"Consultant Doc Controller",
};

export const ROLE_COLORS: Record<string, string> = {
  reviewer:             "badge-gray",
  editor:               "badge-indigo",
  document_controller:  "badge-yellow",
  project_admin:        "badge-green",
  contractor_reviewer:  "badge-yellow",
  consultant_engineer:  "badge-indigo",
  contractor_controller:"badge-yellow",
  consultant_controller:"badge-indigo",
};

export const PERMISSIONS: Record<string, string[]> = {
  upload_document:           ["editor", "document_controller", "project_admin", "consultant_engineer", "consultant_controller"],
  view_document:             ["reviewer", "editor", "document_controller", "project_admin", "contractor_reviewer", "contractor_controller", "consultant_engineer", "consultant_controller"],
  download_original:         ["reviewer", "editor", "document_controller", "project_admin", "contractor_reviewer", "contractor_controller", "consultant_engineer", "consultant_controller"],
  add_annotation:            ["reviewer", "editor", "document_controller", "project_admin", "contractor_reviewer", "contractor_controller"],
  resolve_annotation:        ["reviewer", "editor", "document_controller", "project_admin", "contractor_reviewer", "contractor_controller"],
  delete_others_annotation:  ["document_controller", "project_admin"],
  release_lock:              ["document_controller", "project_admin"],
  create_internal_document:  ["consultant_engineer", "consultant_controller", "project_admin"],
  respond_internal_crs:      ["consultant_engineer", "consultant_controller", "project_admin"],
  verify_internal_package:   ["contractor_reviewer", "contractor_controller", "project_admin"],
  send_to_external_dci:      ["contractor_controller", "project_admin"],
  create_group:              ["document_controller", "project_admin"],
  assign_task:               ["reviewer", "editor", "document_controller", "project_admin"],
  change_task_status:        ["reviewer", "editor", "document_controller", "project_admin"],
};

export function hasPermission(user: MockUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "project_admin") return true;
  return (PERMISSIONS[action] || []).includes(user.role);
}
