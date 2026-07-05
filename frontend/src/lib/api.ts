import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Attach JWT on every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh JWT on 401
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = Cookies.get('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
          Cookies.set('access_token', data.access, { expires: 1 })
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          Cookies.remove('access_token')
          Cookies.remove('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  register: (data: Record<string, string>) => api.post('/auth/register/', data),
  login:    (data: { email: string; password: string }) => api.post('/auth/login/', data),
  logout:   (refresh: string) => api.post('/auth/logout/', { refresh }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password/', { email }),
  verifyOtp:  (data: { email: string; otp_code: string }) => api.post('/auth/verify-otp/', data),
  resetPassword: (data: Record<string, string>) => api.post('/auth/reset-password/', data),
  refreshToken:  (refresh: string) => api.post('/auth/token/refresh/', { refresh }),
}

// ── Users ─────────────────────────────────────────────────────
export const usersApi = {
  me:             () => api.get('/users/me/'),
  updateMe:       (data: Record<string, unknown>) => api.patch('/users/me/', data),
  getProfile:     () => api.get('/users/profile/'),
  updateProfile:  (data: Record<string, unknown>) => api.patch('/users/profile/', data),
  changePassword: (data: Record<string, string>) => api.post('/users/change-password/', data),
  getSessions:    () => api.get('/users/sessions/'),
  revokeSession:  (id: number) => api.delete(`/users/sessions/${id}/`),
  revokeAllSessions: () => api.delete('/users/sessions/revoke-all/'),
}

// ── Documents ─────────────────────────────────────────────────
export const documentsApi = {
  list:           (params?: Record<string, unknown>) => api.get('/documents/', { params }),
  get:            (id: string) => api.get(`/documents/${id}/`),
  delete:         (id: string) => api.delete(`/documents/${id}/`),
  initiateUpload: (data: Record<string, unknown>) => api.post('/documents/upload/initiate/', data),
  uploadChunk:    (formData: FormData) => api.post('/documents/upload/chunk/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  downloadUrl:    (id: string) => api.get(`/documents/${id}/download_url/`),
  getMetadata:    (id: string) => api.get(`/documents/${id}/metadata/`),
  updateMetadata: (id: string, data: Record<string, unknown>) => api.patch(`/documents/${id}/metadata/`, data),
}

// ── AI / Orivo ────────────────────────────────────────────────
export const orivoApi = {
  search:    (query: string, top_k = 10) => api.post('/ai/search/', { query, top_k }),
  aiStatus:  (documentId: string) => api.get(`/ai/status/${documentId}/`),
}

// ── Audit ─────────────────────────────────────────────────────
export const auditApi = {
  getLogs: (params?: Record<string, unknown>) => api.get('/audit/logs/', { params }),
}

// ── Admin ─────────────────────────────────────────────────────
export const adminApi = {
  dashboard:      () => api.get('/admin-panel/dashboard/'),
  users:          (params?: Record<string, unknown>) => api.get('/admin-panel/users/', { params }),
  user:           (id: string) => api.get(`/admin-panel/users/${id}/`),
  updateUser:     (id: string, data: Record<string, unknown>) => api.patch(`/admin-panel/users/${id}/`, data),
  deleteUser:     (id: string) => api.delete(`/admin-panel/users/${id}/`),
  documents:      (params?: Record<string, unknown>) => api.get('/admin-panel/documents/', { params }),
  audits:         (params?: Record<string, unknown>) => api.get('/admin-panel/audits/', { params }),
  security:       () => api.get('/admin-panel/security/'),
  storage:        () => api.get('/admin-panel/storage/'),
}

export default api

// ── Phase 2: AI Intelligence ──────────────────────────────────
export const aiApi = {
  search:           (data: Record<string, unknown>) => api.post('/ai/search/', data),
  suggestions:      (q: string) => api.get('/ai/search/suggestions/', { params: { q } }),
  searchHistory:    () => api.get('/ai/search/history/'),
  popularSearches:  () => api.get('/ai/search/popular/'),
  insights:         (docId: string) => api.get(`/ai/insights/${docId}/`),
  pipelineStatus:   (docId: string) => api.get(`/ai/pipeline/${docId}/`),
  retrigger:        (docId: string) => api.post(`/ai/pipeline/${docId}/retrigger/`),
  similar:          (docId: string) => api.get(`/ai/similar/${docId}/`),
  recommendations:  (docId: string) => api.get(`/ai/recommendations/${docId}/`),
  collections:      () => api.get('/ai/collections/'),
  collectionDocs:   (id: string) => api.get(`/ai/collections/${id}/documents/`),
  seedCollections:  () => api.post('/ai/collections/seed/'),
  aiDashboard:      () => api.get('/ai/dashboard/'),
}

// ── Phase 2: Admin AI Monitoring ──────────────────────────────
export const adminAiApi = {
  monitor:         () => api.get('/admin-panel/ai/monitor/'),
  ocrQueue:        (status?: string) => api.get('/admin-panel/ai/ocr-queue/', { params: status ? { status } : {} }),
  failedQueue:     () => api.get('/admin-panel/ai/failed/'),
  retriggerFailed: () => api.post('/admin-panel/ai/retrigger-failed/'),
  searchAnalytics: () => api.get('/admin-panel/ai/search-analytics/'),
  classificationMetrics: () => api.get('/admin-panel/ai/classification-metrics/'),
}

// ── Phase 3: Compliance ───────────────────────────────────────
export const complianceApi = {
  dashboard:        () => api.get('/compliance/dashboard/'),
  scan:             (industry: string) => api.post('/compliance/scan/', { industry }),
  missingDocs:      () => api.get('/compliance/missing/'),
  expiryAlerts:     () => api.get('/compliance/expiry/'),
  dismissAlert:     (id: string) => api.patch(`/compliance/expiry/${id}/dismiss/`),
  generatePackage:  (name?: string) => api.post('/compliance/audit-package/generate/', { name }),
  auditPackages:    () => api.get('/compliance/audit-packages/'),
  askCopilot:       (question: string) => api.post('/compliance/copilot/', { question }),
  copilotHistory:   () => api.get('/compliance/copilot/history/'),
  timeline:         () => api.get('/compliance/timeline/'),
  recordCorrection: (data: Record<string,string>) => api.post('/compliance/training/correction/', data),
}

// ── Phase 3: Contracts ────────────────────────────────────────
export const contractsApi = {
  list:          (params?: Record<string,string>) => api.get('/contracts/', { params }),
  detail:        (id: string) => api.get(`/contracts/${id}/`),
  analyze:       (document_id: string) => api.post('/contracts/analyze/', { document_id }),
  renewals:      (days=90) => api.get('/contracts/renewals/', { params: { days } }),
  riskSummary:   () => api.get('/contracts/risk-summary/'),
  updateRenewal: (id: string, data: Record<string,unknown>) => api.patch(`/contracts/renewals/${id}/action/`, data),
}

// ── Phase 4: Copilot ──────────────────────────────────────────
export const copilotApi = {
  query:            (data: Record<string, unknown>) => api.post('/copilot/query/', data),
  conversations:    (params?: Record<string,string>) => api.get('/copilot/conversations/', { params }),
  conversation:     (id: string) => api.get(`/copilot/conversations/${id}/`),
  deleteConversation:(id: string) => api.delete(`/copilot/conversations/${id}/`),
  pinConversation:  (id: string) => api.post(`/copilot/conversations/${id}/pin/`),
  prompts:          (category?: string) => api.get('/copilot/prompts/', { params: category ? { category } : {} }),
  createPrompt:     (data: Record<string, unknown>) => api.post('/copilot/prompts/create/', data),
  seedPrompts:      () => api.post('/copilot/prompts/seed/'),
  generateReport:   (data: Record<string, unknown>) => api.post('/copilot/reports/generate/', data),
  reports:          () => api.get('/copilot/reports/'),
  reportDetail:     (id: string) => api.get(`/copilot/reports/${id}/`),
  recommendations:  () => api.get('/copilot/recommendations/'),
  dismissRecommendation: (id: string) => api.patch(`/copilot/recommendations/${id}/dismiss/`),
  dashboard:        () => api.get('/copilot/dashboard/'),
  multiDocAnalyze:  (data: Record<string, unknown>) => api.post('/copilot/analyze/', data),
}

// ── Phase 4: Knowledge Graph ───────────────────────────────────
export const knowledgeApi = {
  graph:        () => api.get('/knowledge/graph/'),
  build:        () => api.post('/knowledge/build/'),
  search:       (q: string) => api.get('/knowledge/search/', { params: { q } }),
  vendorProfile:(name: string) => api.get(`/knowledge/vendor/${encodeURIComponent(name)}/`),
}

// ── Phase 4: Admin AI Governance ───────────────────────────────
export const adminGovernanceApi = {
  governance:      () => api.get('/admin-panel/ai-governance/'),
  prompts:         () => api.get('/admin-panel/prompts/'),
  knowledgeStats:  () => api.get('/admin-panel/knowledge-stats/'),
  flaggedResponses:() => api.get('/admin-panel/flagged-responses/'),
}
