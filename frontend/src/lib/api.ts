import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Projects
export const getProjects = () => api.get("/projects/").then(r => r.data);
export const createProject = (payload: Record<string, unknown>) =>
  api.post("/projects/", payload).then(r => r.data);
export const updateProject = (projectId: number, payload: Record<string, unknown>) =>
  api.patch(`/projects/${projectId}`, payload).then(r => r.data);

// Collaboration documents
export const getDocuments = (projectId: number) =>
  api.get(`/documents/?project_id=${projectId}`).then(r => r.data);
export const uploadDocument = (formData: FormData) =>
  api.post("/documents/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
export const getSignedUrl = (fileId: string, actorUserId = "system") =>
  api.get(`/documents/${fileId}/signed-url`, { params: { actor_user_id: actorUserId } }).then(r => r.data);


// Document locking
export const getLockStatus = (fileId: string, actorUserId: string) =>
  api.get("/locks/status", { params: { file_id: fileId, actor_user_id: actorUserId } }).then(r => r.data);
export const acquireDocumentLock = (fileId: string, actorUserId: string) =>
  api.post("/locks/acquire", { file_id: fileId, actor_user_id: actorUserId }).then(r => r.data);
export const heartbeatDocumentLock = (lockId: string, lockToken: string, actorUserId: string) =>
  api.post("/locks/heartbeat", { lock_id: lockId, lock_token: lockToken, actor_user_id: actorUserId }).then(r => r.data);
export const releaseDocumentLock = (lockId: string, lockToken: string, actorUserId: string) =>
  api.post("/locks/release", { lock_id: lockId, lock_token: lockToken, actor_user_id: actorUserId }).then(r => r.data);

// Annotations
export const getAnnotations = (fileId: string) =>
  api.get(`/annotations/?file_id=${fileId}`).then(r => r.data);
export const createAnnotation = (payload: Record<string, unknown>) =>
  api.post("/annotations/", payload).then(r => r.data);
export const resolveAnnotation = (id: string, actorUserId: string) =>
  api.patch(`/annotations/${id}/resolve`, { actor_user_id: actorUserId }).then(r => r.data);
export const reopenAnnotation = (id: string, actorUserId: string) =>
  api.patch(`/annotations/${id}/reopen`, { actor_user_id: actorUserId }).then(r => r.data);
export const deleteAnnotation = (id: string, actorUserId: string, lockToken: string) =>
  api.delete(`/annotations/${id}`, { params: { actor_user_id: actorUserId, lock_token: lockToken } }).then(r => r.data);
export const addReply = (annotationId: string, payload: Record<string, unknown>) =>
  api.post(`/annotations/${annotationId}/replies`, payload).then(r => r.data);

// Tasks
export const getTasks = (projectId: number) =>
  api.get(`/tasks/?project_id=${projectId}`).then(r => r.data);
export const createTask = (payload: Record<string, unknown>) =>
  api.post("/tasks/", payload).then(r => r.data);
export const updateTask = (id: string, payload: Record<string, unknown>) =>
  api.patch(`/tasks/${id}`, payload).then(r => r.data);

// Users
export const getUsers = (projectId?: number) =>
  api.get("/users/", { params: projectId ? { project_id: projectId } : undefined }).then(r => r.data);

// DCI dashboard
export const getDCIDocuments = (projectId: number) =>
  api.get("/dci/documents", { params: { project_id: projectId } }).then(r => r.data);
export const getSummary = (projectId: number) =>
  api.get("/dci/summary", { params: { project_id: projectId } }).then(r => r.data);
export const getApprovalStatus = (projectId: number) =>
  api.get("/dci/approval-status", { params: { project_id: projectId } }).then(r => r.data);
export const getDisciplineAnalysis = (projectId: number) =>
  api.get("/dci/discipline-analysis", { params: { project_id: projectId } }).then(r => r.data);
export const getVendorAnalysis = (projectId: number) =>
  api.get("/dci/vendor-analysis", { params: { project_id: projectId } }).then(r => r.data);
export const getDelaysAging = (projectId: number) =>
  api.get("/dci/delays-aging", { params: { project_id: projectId } }).then(r => r.data);
export const getTimeline = (projectId: number) =>
  api.get("/dci/timeline", { params: { project_id: projectId } }).then(r => r.data);
export const getDCIFilters = (projectId: number) =>
  api.get("/dci/filters", { params: { project_id: projectId } }).then(r => r.data);
export const getDCIDocumentChoices = (projectId: number) =>
  api.get("/dci/document-choices", { params: { project_id: projectId } }).then(r => r.data);
export const getDCIDocument = (documentId: number) =>
  api.get(`/dci/document/${documentId}`).then(r => r.data);
export const getDocumentTimeline = (documentId: number) =>
  api.get(`/dci/document/${documentId}/timeline`).then(r => r.data);
export const updateDCIDocument = (documentId: number, payload: Record<string, unknown>) =>
  api.patch(`/dci/document/${documentId}`, payload).then(r => r.data);
export const getRegister = (
  projectId: number,
  page = 1,
  search = "",
  filters: Record<string, string> = {},
) => api.get("/dci/register", {
  params: { project_id: projectId, page, page_size: 50, search, ...filters },
}).then(r => r.data);

// Import / export
export const listImports = (projectId: number) =>
  api.get("/imports/", { params: { project_id: projectId } }).then(r => r.data);
export const previewWorkbook = (formData: FormData) =>
  api.post("/imports/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
export const uploadWorkbook = (formData: FormData) =>
  api.post("/imports/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
export const previewImport = (importId: number, limit = 20) =>
  api.get(`/imports/${importId}/preview`, { params: { limit } }).then(r => r.data);
export const exportWorkbookUrl = (projectId: number, actorUserId = "system") =>
  `${API_URL}/imports/export/workbook?project_id=${projectId}&actor_user_id=${encodeURIComponent(actorUserId)}`;
export const exportHistoryUrl = (projectId: number, actorUserId = "system") =>
  `${API_URL}/imports/export/history?project_id=${projectId}&actor_user_id=${encodeURIComponent(actorUserId)}`;


export type DashboardFilters = { search?: string; discipline?: string; vendor?: string; status?: string; code?: string; revision?: string };
export const getDashboardAnalytics = (projectId: number, filters: DashboardFilters = {}) =>
  api.get("/dci/analytics", { params: { project_id: projectId, ...filters } }).then(r => r.data);
export const getDashboardConfig = (projectId: number) =>
  api.get("/dci/dashboard-config", { params: { project_id: projectId } }).then(r => r.data);
export const updateDashboardConfig = (projectId: number, payload: { closed_codes: string[]; resubmission_codes: string[] }) =>
  api.put("/dci/dashboard-config", payload, { params: { project_id: projectId } }).then(r => r.data);

export type MasterData = {
  vendors: string[];
  disciplines: string[];
  revisions: string[];
  code_labels: Record<string, string>;
};
export const getMasterData = (projectId: number) =>
  api.get('/dci/master-data', { params: { project_id: projectId } }).then(r => r.data as MasterData);
export const updateMasterData = (projectId: number, payload: MasterData) =>
  api.put('/dci/master-data', payload, { params: { project_id: projectId } }).then(r => r.data as MasterData);
export const createDCIDocument = (projectId: number, payload: Record<string, unknown>) =>
  api.post('/dci/documents', payload, { params: { project_id: projectId } }).then(r => r.data);
