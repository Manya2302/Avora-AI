// ── Auth ──────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'user' | 'viewer'
  is_active: boolean
  is_email_verified: boolean
  created_at: string
  profile: UserProfile | null
}

export interface UserProfile {
  id: number
  user: string
  company_name: string
  industry: string
  phone: string
  city: string
  state: string
  address: string
  job_title: string
  bio: string
  avatar_url: string
  storage_used: number
  plan: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

// ── Documents ─────────────────────────────────────────────────
export type DocStatus = 'uploading' | 'processing' | 'encrypted' | 'ai_ready' | 'failed'

export interface Document {
  id: string
  original_name: string
  file_extension: string
  mime_type: string
  original_size: number
  compressed_size: number
  encrypted_size: number
  total_chunks: number
  status: DocStatus
  version: number
  category: string
  tags: string[]
  ai_summary: string
  ocr_text?: string
  created_at: string
  updated_at: string
}

export interface DocumentMetadata {
  id: number
  document: string
  category: string
  department: string
  year: string
  tags: string[]
  ai_summary: string
  page_count: number
  language: string
}

export interface DocumentChunk {
  chunk_index: number
  chunk_size: number
  sha256_hash: string
  upload_status: string
}

// ── Upload ────────────────────────────────────────────────────
export interface UploadInitResponse {
  document_id: string
  total_chunks: number
  chunk_size: number
  storage_key: string
  aes_key_hex: string
}

export interface ChunkUploadProgress {
  documentId: string
  fileName: string
  totalChunks: number
  uploadedChunks: number
  status: 'idle' | 'compressing' | 'encrypting' | 'uploading' | 'processing' | 'done' | 'error'
  error?: string
}

// ── Search ────────────────────────────────────────────────────
export interface SearchResult {
  document_id: string
  score: number
  original_name: string
  category: string
  tags: string[]
}

// ── Audit ─────────────────────────────────────────────────────
export interface AuditLog {
  id: string
  user_email: string
  user_name: string
  action: string
  document_id: string
  resource: string
  ip_address: string
  is_flagged: boolean
  created_at: string
}

// ── Pagination ────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ── Admin ─────────────────────────────────────────────────────
export interface AdminDashboardStats {
  total_users: number
  total_documents: number
  active_sessions: number
  security_alerts: number
  storage_bytes: number
}

// ── Phase 2: AI Intelligence ──────────────────────────────────
export interface AIQueue {
  id: string
  document_id: string
  stage: string
  progress: number
  error_message: string
  retry_count: number
  started_at: string
  completed_at: string
  duration_ms: number
}

export interface DocumentInsight {
  document_id: string
  queue: AIQueue | null
  ocr: { status: string; confidence: number; word_count: number; page_count: number; engine: string } | null
  classification: { category: string; confidence: number; confidentiality: string; risk_score: number } | null
  metadata: { vendor: string; client: string; department: string; year: string; amount: string | null; currency: string; country: string; keywords: string[]; entities: Record<string, string[]> } | null
  summary: { short: string; medium: string; long: string; key_points: string[] } | null
  tags: Array<{ tag: string; confidence: number }>
  relationships: Array<{ target_document_id: string; relationship_type: string; similarity_score: number }>
  recommendations: Array<{ recommended_document_id: string; score: number; reason: string }>
}

export interface SmartCollection {
  id: string
  name: string
  icon: string
  color: string
  document_count: number
  collection_type: string
  category_filter: string
}

export interface SimilarDocument {
  document_id: string
  original_name: string
  category: string
  similarity_score: number
  relationship: string
  label: string
}

export interface SearchSuggestion { query: string; count?: number }
export interface SearchResultItem {
  document_id: string
  original_name: string
  category: string
  tags: string[]
  short_summary: string
  confidentiality: string
  score: number
}

// ── Phase 3 Types ─────────────────────────────────────────────
export interface ComplianceCheck { name:string; status:string; priority:string; doc_type:string; score:number }
export interface ComplianceDashboard {
  score:number; audit_readiness:number; grade:string; total_checks:number
  compliant:number; missing_count:number; critical_missing:number
  checks:ComplianceCheck[]; missing:Array<{name:string;priority:string;doc_type:string}>
  recommendation:string; expiry_alerts:number; industry:string
  upcoming_events:any[]
}
export interface ExpiryAlert { id:string; document_id:string; doc_name:string; doc_type:string; expiry_date:string; alert_type:string; days_until:number; is_dismissed:boolean }
export interface AuditPackage { id:string; name:string; status:string; doc_count:number; readiness_score:number; gaps:string[]; generated_at:string; created_at:string }
export interface CopilotMessage { id:string; role:'user'|'assistant'; message:string; created_at:string }
export interface ContractItem { id:string; document_id:string; title:string; party_a:string; party_b:string; contract_type:string; effective_date:string; expiry_date:string; risk_level:string; risk_score:number; status:string; contract_value:string; currency:string; risk_count:number; days_to_expiry:number; created_at:string }
export interface ContractClause { id:string; clause_type:string; title:string; ai_summary:string; risk_flag:'green'|'yellow'|'red'; risk_reason:string; is_standard:boolean }
export interface ContractRisk { id:string; title:string; description:string; severity:string; category:string; recommendation:string; is_resolved:boolean }
export interface ContractRenewal { id:string; renewal_due:string; notice_deadline:string; days_until:number; action:string; notes:string }
export interface ContractRiskSummary { total:number; critical:number; high:number; medium:number; low:number; expiring_30:number; expired:number; auto_renewal:number; total_value:number }

// ── Phase 4: Copilot Types ──────────────────────────────────────
export interface DocSource {
  document_id: string
  document_name: string
  relevance: number
  excerpt: string
  category?: string
}
export interface CopilotMsg {
  id: string
  role: 'user'|'assistant'|'system'
  content: string
  confidence_score?: number
  sources_count?: number
  references?: DocSource[]
  created_at: string
}
export interface Conversation {
  id: string
  title: string
  mode: 'document'|'compliance'|'audit'|'knowledge'|'risk'
  message_count: number
  is_pinned: boolean
  updated_at: string
  created_at: string
}
export interface PromptTemplate {
  id: string
  title: string
  description: string
  prompt: string
  category: string
  use_count: number
  is_builtin: boolean
}
export interface AIReport {
  id: string
  title: string
  report_type: string
  status: 'generating'|'ready'|'failed'
  executive_summary: string
  full_content: string
  key_findings: string[]
  recommendations: string[]
  doc_count: number
  confidence_score: number
  generated_at: string
  created_at: string
}
export interface AIRecommendation {
  id: string
  title: string
  description: string
  action: string
  priority: 'critical'|'high'|'medium'|'low'
  category: string
  is_dismissed: boolean
  created_at: string
}
export interface KnowledgeNode { id: string; name: string; type: string; doc_id: string | null }
export interface KnowledgeEdge { source: string; target: string; type: string; conf: number }
export interface KnowledgeGraphData {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  stats: { total_nodes: number; total_edges: number; by_type: Record<string, number> }
}
