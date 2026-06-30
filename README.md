# Avora AI — Phase 1 + 2 + 3 + 4

> AI-Powered Zero-Knowledge Document Intelligence Platform
> **Phase 4: AI Copilot & Enterprise Knowledge Assistant**

---

## What's in Phase 4

Avora stops being a document manager and becomes an **organizational memory system** — users ask questions in plain language and get evidence-backed answers grounded in their own documents.

| Feature | Description |
|---|---|
| **Avora Copilot** | `/copilot` — Enterprise chat interface, 5 modes (Document/Compliance/Audit/Knowledge/Risk) |
| **RAG Engine** | Query → embed → retrieve → rank → generate → cite, fully evidence-based |
| **Evidence Citations** | Every answer shows source documents, relevance %, and excerpts |
| **Knowledge Graph** | Auto-links vendors → contracts → invoices → payments → compliance |
| **Organizational Memory** | Answers persist even after the document creator leaves |
| **AI Reasoning Log** | Internal reasoning chain stored for every response — full explainability |
| **5 Copilot Modes** | Document, Compliance, Audit, Knowledge, Risk assistants |
| **AI Generated Reports** | Vendor Compliance, Audit Evidence, Contract Summary, Risk Assessment, Compliance Gap |
| **Multi-Document Intelligence** | Cross-analyze contracts + invoices + payments to find gaps |
| **Smart Recommendations** | Proactive suggestions surfaced in Recommendations Center |
| **Conversation Memory** | Follow-up questions retain context within a conversation |
| **Conversation History** | Pin, search, and revisit past conversations |
| **Prompt Library** | 12 built-in enterprise prompts + custom prompt creation |
| **AI Workspace** | `/copilot/workspace` — command center for all Copilot tools |
| **Hallucination Detection** | Flags amounts/facts in answers not present in source documents |
| **Admin AI Governance** | Usage metrics, confidence tracking, flagged response review queue |
| **Admin Prompt Management** | Platform-wide visibility into prompt template usage |

---

## Quick Start

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

docker-compose up -d
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
docker-compose exec ollama ollama pull nomic-embed-text
docker-compose exec ollama ollama pull llama3

# Seed the prompt library
docker-compose exec backend python manage.py shell -c "
from apps.copilot.services.prompt_library import seed_builtin_prompts
print(seed_builtin_prompts(), 'prompts seeded')
"

# Open
# Copilot:    http://localhost:3000/copilot
# Workspace:  http://localhost:3000/copilot/workspace
# Knowledge:  http://localhost:3000/knowledge
```

---

## RAG Pipeline

```
User Question
    ↓
Query Expansion (uses last 3 turns of conversation for context)
    ↓
Embedding Search (Qdrant, owner-scoped, top-8 docs, score≥0.6)
    ↓
Context Building (pulls OCR text, extracts most relevant passages)
    ↓
LLM Generation (Ollama llama3, mode-specific system prompt, strict citation rules)
    ↓
Confidence Scoring (retrieval score − uncertainty penalty)
    ↓
Hallucination Detection (checks amounts/facts vs source context)
    ↓
Response + Sources + Confidence + Flags
```

Guardrails enforced in every response:
- Only answers from retrieved documents (never general knowledge)
- Always cites which source document(s) support the answer
- Says "I could not find this in the available documents" rather than guessing
- Never invents document names, dates, or amounts
- Owner-scoped retrieval — never crosses user/tenant boundaries

---

## Knowledge Graph

```
Document → Classification + Metadata extraction
    ↓
KnowledgeNode created (vendor / customer / contract / invoice / department / document)
    ↓
KnowledgeRelationship created (belongs_to / issued_to / related_to / linked_to)
    ↓
Contracts auto-linked to invoices sharing the same vendor
    ↓
Graph queryable via /api/knowledge/graph/ and visualized in Knowledge Explorer
```

Example chain: `Vendor → Contract → Invoice → Payment → Audit Record → Compliance Report`

---

## Phase 4 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/copilot/query/` | POST | Main RAG query — returns answer + sources + confidence |
| `/api/copilot/conversations/` | GET | List conversations |
| `/api/copilot/conversations/<id>/` | GET/DELETE | Conversation detail / delete |
| `/api/copilot/conversations/<id>/pin/` | POST | Pin/unpin |
| `/api/copilot/prompts/` | GET | Prompt library |
| `/api/copilot/prompts/seed/` | POST | Load 12 built-in prompts |
| `/api/copilot/reports/generate/` | POST | Generate AI report from documents |
| `/api/copilot/reports/` | GET | List reports |
| `/api/copilot/recommendations/` | GET | Proactive recommendations |
| `/api/copilot/dashboard/` | GET | Usage metrics |
| `/api/copilot/analyze/` | POST | Multi-document cross-analysis |
| `/api/knowledge/graph/` | GET | Full knowledge graph data |
| `/api/knowledge/build/` | POST | Rebuild knowledge graph |
| `/api/knowledge/search/` | GET | Search knowledge nodes |
| `/api/knowledge/vendor/<name>/` | GET | Vendor profile with linked documents |
| `/api/admin-panel/ai-governance/` | GET | Platform-wide Copilot governance metrics |
| `/api/admin-panel/flagged-responses/` | GET | Low-confidence response review queue |

---

## New Database Models — Phase 4

| Model | Purpose |
|---|---|
| `CopilotConversation` | Multi-turn conversation, mode, pin state |
| `CopilotMessage` | Single turn — content, confidence, latency, tokens |
| `DocumentReference` | Source citation attached to a message |
| `PromptTemplate` | Built-in + custom enterprise prompts |
| `AIReport` | Generated multi-document report |
| `ReasoningLog` | Internal reasoning chain, hallucination flags |
| `AIRecommendation` | Proactive suggestion with priority |
| `KnowledgeNode` | Entity in the org knowledge graph |
| `KnowledgeRelationship` | Directed edge between two nodes |

---

## New Frontend Pages — Phase 4

| Page | Route |
|---|---|
| Avora Copilot | `/copilot` |
| AI Workspace | `/copilot/workspace` |
| Generated Reports | `/copilot/reports` |
| Conversation History | `/copilot/history` |
| Prompt Library | `/copilot/prompts` |
| Recommendations Center | `/copilot/recommendations` |
| Knowledge Explorer | `/knowledge` |
| Admin: AI Governance | `/securevault-admin/ai-governance` |
| Admin: Prompt Management | `/securevault-admin/prompt-management` |

---

## End State

```
Phase 1 (Secure Storage) + Phase 2 (Document Intelligence)
+ Phase 3 (Compliance Intelligence) + Phase 4 (Enterprise Knowledge Assistant)
= Avora AI: an organizational memory system.

Users no longer search folders.
Users no longer read documents end-to-end.
Users ask a question — Avora retrieves, reasons, and answers with evidence.
```
