import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// --- Documents ---
export const getDocuments = (project_id: number) =>
  api.get(`/documents/?project_id=${project_id}`).then(r => r.data);

export const uploadDocument = (formData: FormData) =>
  api.post("/documents/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);

export const getSignedUrl = (file_id: string) =>
  api.get(`/documents/${file_id}/signed-url`).then(r => r.data);

// --- Annotations ---
export const getAnnotations = (file_id: string) =>
  api.get(`/annotations/?file_id=${file_id}`).then(r => r.data);

export const createAnnotation = (payload: Record<string, unknown>) =>
  api.post("/annotations/", payload).then(r => r.data);

export const resolveAnnotation = (id: string, actor_user_id: string) =>
  api.patch(`/annotations/${id}/resolve`, { actor_user_id }).then(r => r.data);

export const deleteAnnotation = (id: string, actor_user_id: string) =>
  api.delete(`/annotations/${id}?actor_user_id=${actor_user_id}`).then(r => r.data);

export const addReply = (annotation_id: string, payload: Record<string, unknown>) =>
  api.post(`/annotations/${annotation_id}/replies`, payload).then(r => r.data);

// --- Tasks ---
export const getTasks = (project_id: number) =>
  api.get(`/tasks/?project_id=${project_id}`).then(r => r.data);

export const createTask = (payload: Record<string, unknown>) =>
  api.post("/tasks/", payload).then(r => r.data);

export const updateTask = (id: string, payload: Record<string, unknown>) =>
  api.patch(`/tasks/${id}`, payload).then(r => r.data);

// --- Users ---
export const getUsers = () =>
  api.get("/users/").then(r => r.data);

// --- DCI documents (from main Supabase DB) ---
export const getDCIProjects = () =>
  api.get("/projects/").then(r => r.data);

// --- DCI Dashboard data ---
export const getDCIDocuments = (project_id: number) =>
  api.get(`/dci/documents?project_id=${project_id}`).then(r => r.data);

export const getApprovalStatus = (project_id: number) =>
  api.get(`/dci/approval-status?project_id=${project_id}`).then(r => r.data);

export const getDisciplineAnalysis = (project_id: number) =>
  api.get(`/dci/discipline-analysis?project_id=${project_id}`).then(r => r.data);

export const getVendorAnalysis = (project_id: number) =>
  api.get(`/dci/vendor-analysis?project_id=${project_id}`).then(r => r.data);

export const getDelaysAging = (project_id: number) =>
  api.get(`/dci/delays-aging?project_id=${project_id}`).then(r => r.data);

export const getTimeline = (project_id: number) =>
  api.get(`/dci/timeline?project_id=${project_id}`).then(r => r.data);

export const getDCIDocumentChoices = (project_id: number) =>
  api.get(`/dci/document-choices?project_id=${project_id}`).then(r => r.data);

export const getRegister = (project_id: number, page = 1, search = "") =>
  api.get(`/dci/register?project_id=${project_id}&page=${page}&search=${encodeURIComponent(search)}`).then(r => r.data);

// --- Import / Export ---
export const listImports = (project_id: number) =>
  api.get(`/imports/list?project_id=${project_id}`).then(r => r.data);

export const uploadWorkbook = (formData: FormData) =>
  api.post("/imports/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);

export const previewImport = (import_id: number, limit = 20) =>
  api.get(`/imports/preview?import_id=${import_id}&limit=${limit}`).then(r => r.data);

export const exportDocuments = (project_id: number) =>
  `${API_URL}/imports/export?project_id=${project_id}`;
