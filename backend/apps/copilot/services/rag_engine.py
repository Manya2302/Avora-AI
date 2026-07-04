"""
Avora AI Phase 4 — RAG Engine
Retrieval-Augmented Generation pipeline:
Query → Multi-Query Expansion → Multi-Vector Retrieval → Paragraph Chunking → Cohere Reranking → Groq/Ollama Synthesis
"""
import time
import logging
import requests
import os
import re
from django.conf import settings

logger = logging.getLogger(__name__)

MAX_DOCS = 8
MAX_CTX_TOKENS = 4000
CONFIDENCE_THRESHOLD = -1.0  # Allow negative similarity scores in retrieval, let Cohere Rerank filter them!


class AvoraRAGEngine:
    """
    State-of-the-art Hybrid RAG pipeline matching enterprise search capabilities (Glean/Box AI).
    Every response includes source citations.
    """

    def query(self, question: str, owner_id: str,
              mode: str = "document", conversation_history: list = None) -> dict:
        t0 = time.time()

        # 1 — Multi-Query Expansion
        queries = self._expand_query_multi(question, conversation_history or [])

        # 2 & 3 — Retrieve chunks for all query variations directly from Qdrant
        chunks = self._retrieve_chunks_multi(queries, owner_id)

        # 4 — Rerank chunks with Cohere Rerank
        top_chunks, refs = self._rerank_chunks(chunks, question)

        # 5 — Build context from top ranked chunks
        context = self._build_context(top_chunks)

        # 6 — Generate answer with Groq (Llama-3.3-70B) or Ollama
        answer, thinking = self._generate_answer(question, context, mode, conversation_history or [])

        # 7 — Score confidence based on Cohere relevance score
        confidence = self._score_confidence(answer, top_chunks)

        # 8 — Detect hallucinations
        flags = self._detect_hallucinations(answer, context)

        elapsed = int((time.time() - t0) * 1000)
        return {
            "answer":         answer,
            "thinking":       thinking,
            "confidence":     confidence,
            "sources":        refs,
            "sources_count":  len(refs),
            "latency_ms":     elapsed,
            "docs_retrieved": len(set(c["document_id"] for c in chunks)),
            "hallucination_flags": flags,
            "query_expanded": ", ".join(queries),
        }

    def _expand_query_multi(self, question: str, history: list) -> list:
        """Expand user query into multiple variations using LLM to capture diverse wording."""
        groq_key = getattr(settings, "GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
        if not groq_key:
            # Simple fallback expansions
            return [
                question,
                f"{question} summary",
                f"{question} explanation"
            ]

        try:
            # Keep history context short
            history_summary = ""
            if history:
                last_turns = history[-2:]
                history_summary = " ".join([f"{m['role']}: {m['content'][:80]}" for m in last_turns])

            system_prompt = (
                "You are an expert search query expander. Generate 3 distinct search query variations "
                "for the user's question to retrieve relevant documents from a vector database. "
                "Each variation should capture different wording/phrasing (e.g. 'system overview' vs 'architecture' vs 'executive summary'). "
                "Return them as a flat, comma-separated list of strings. Do not include numbering, labels, introductory text, or explanations."
            )

            user_content = question
            if history_summary:
                user_content = f"Conversation Context: {history_summary}\nUser Question: {question}"

            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ],
                    "temperature": 0.1
                },
                timeout=10
            )
            resp.raise_for_status()
            text = resp.json()['choices'][0]['message']['content'].strip()
            queries = [q.strip().strip('"').strip("'") for q in text.split(",") if q.strip()]
            
            # Make sure original question is first
            if question not in queries:
                queries.insert(0, question)
            return queries[:4]
        except Exception as e:
            logger.warning(f"[RAG] Groq query expansion failed: {e}")
            return [question, f"{question} summary", f"{question} details"]

    def _retrieve_chunks_multi(self, queries: list, owner_id: str) -> list:
        """Search Qdrant for all query variations, combine and deduplicate chunk results."""
        try:
            from apps.ai.services.embeddings import generate_embedding
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from utils.qdrant_client import get_client

            client = get_client()

            retrieved_chunks = {}
            for q in queries:
                try:
                    vector = generate_embedding(q, is_query=True)
                    res = client.query_points(
                        collection_name=settings.QDRANT_COLLECTION,
                        query=vector,
                        query_filter=Filter(must=[FieldCondition(key="owner_id", match=MatchValue(value=owner_id))]),
                        limit=12,
                        with_payload=True,
                        score_threshold=CONFIDENCE_THRESHOLD,
                    )
                    hits = res.points
                    for h in hits:
                        chunk_id = str(h.id)
                        doc_id = h.payload.get("document_id")
                        if not doc_id:
                            continue
                        if chunk_id not in retrieved_chunks or h.score > retrieved_chunks[chunk_id]["score"]:
                            retrieved_chunks[chunk_id] = {
                                "chunk_id":       chunk_id,
                                "document_id":    doc_id,
                                "original_name":  h.payload.get("original_name", ""),
                                "category":       h.payload.get("category", ""),
                                "text":           h.payload.get("chunk_text", h.payload.get("short_summary", "")),
                                "score":          h.score,
                            }
                except Exception as query_err:
                    logger.warning(f"[RAG] Single query search error for '{q}': {query_err}")

            return list(retrieved_chunks.values())
        except Exception as e:
            logger.error(f"[RAG] Multi-retrieval error: {e}")
            return []

    def _rerank_chunks(self, chunks: list, query: str) -> tuple[list, list]:
        """Rank chunks using Cohere Rerank API to find the most relevant paragraphs."""
        cohere_key = os.getenv("COHERE_API_KEY")
        if not cohere_key or not chunks:
            # Fallback: simple token overlap scoring
            scored_chunks = []
            q_words = set(w for w in query.lower().split() if len(w) > 2)
            for c in chunks:
                c_words = set(w for w in c["text"].lower().split() if len(w) > 2)
                score = len(q_words & c_words) / max(1, len(q_words))
                c["relevance_score"] = score
                scored_chunks.append(c)
            scored_chunks.sort(key=lambda x: -x["relevance_score"])
            
            # Map sources
            refs = []
            seen_docs = set()
            for c in scored_chunks[:5]:
                doc_id = c["document_id"]
                if doc_id not in seen_docs:
                    seen_docs.add(doc_id)
                    refs.append({
                        "document_id":   doc_id,
                        "document_name": c["original_name"],
                        "relevance":     c["relevance_score"],
                        "excerpt":       c["text"][:300],
                        "category":      c["category"]
                    })
            return scored_chunks[:5], refs

        try:
            # Limit chunks to rank for performance safety (top 40)
            chunks_to_rank = chunks[:40]
            cohere_resp = requests.post(
                "https://api.cohere.com/v1/rerank",
                headers={
                    "accept":        "application/json",
                    "content-type":  "application/json",
                    "Authorization": f"bearer {cohere_key}"
                },
                json={
                    "model":     "rerank-english-v3.0",
                    "query":     query,
                    "documents": [c["text"] for c in chunks_to_rank]
                },
                timeout=8
            )
            cohere_resp.raise_for_status()
            results = cohere_resp.json().get("results", [])

            top_chunks = []
            refs = []
            seen_docs = set()

            for r in results[:5]:  # Select top 5 chunks
                idx = r["index"]
                score = r["relevance_score"]
                chunk_data = chunks_to_rank[idx]
                chunk_data["relevance_score"] = score
                top_chunks.append(chunk_data)

                # Add unique sources
                doc_id = chunk_data["document_id"]
                if doc_id not in seen_docs:
                    seen_docs.add(doc_id)
                    refs.append({
                        "document_id":   str(doc_id),
                        "document_name": chunk_data["original_name"],
                        "relevance":     round(score, 4),
                        "excerpt":       chunk_data["text"][:300],
                        "category":      chunk_data["category"]
                    })

            return top_chunks, refs
        except Exception as e:
            logger.warning(f"[RAG] Cohere Rerank failed: {e}")
            # Fall back to first 5 chunks directly
            for c in chunks[:5]:
                c["relevance_score"] = 0.5
            return chunks[:5], []

    def _build_context(self, top_chunks: list) -> str:
        """Format the top ranked chunks with sources into a clean prompt context."""
        context_parts = []
        for i, chunk in enumerate(top_chunks):
            src_name = chunk.get('original_name', '')
            src_cat  = chunk.get('category', '')
            context_parts.append(f"[Source {i+1}: {src_name} | Category: {src_cat}]\n{chunk['text']}\n")
        return "\n---\n".join(context_parts)

    def _generate_answer(self, question: str, context: str,
                          mode: str, history: list) -> tuple[str, str]:
        """Generate answer using Groq (Llama-3.3-70B) with local Ollama fallback."""
        mode_instructions = {
            "document":   "You are a document assistant. Answer from the provided documents only.",
            "compliance": "You are a compliance expert. Identify compliance status from documents.",
            "audit":      "You are an audit assistant. Prepare evidence-based responses.",
            "knowledge":  "You are an organizational knowledge assistant. Connect related information.",
            "risk":       "You are a risk analyst. Identify and explain risks from documents.",
        }

        system_instruction = (
            f"{mode_instructions.get(mode, mode_instructions['document'])}\n"
            "Analyze the DOCUMENT CONTEXT below and answer the user query.\n"
            "Keep your response direct, structured, and format lists cleanly in markdown.\n"
            "If the answer cannot be found in the contexts, reply: \"I could not find this in the available documents.\""
        )

        thinking = f"Query: {question}\nContext Length: {len(context)} chars\nMode: {mode}"
        groq_key = getattr(settings, "GROQ_API_KEY", os.getenv("GROQ_API_KEY"))

        if groq_key:
            try:
                messages = [{"role": "system", "content": f"{system_instruction}\n\nDOCUMENT CONTEXT:\n{context}"}]
                for h in history[-4:]:
                    messages.append({"role": h['role'].lower(), "content": h['content']})
                messages.append({"role": "user", "content": question})

                resp = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": messages,
                        "temperature": 0.2,
                        "max_tokens": 1000
                    },
                    timeout=15
                )
                resp.raise_for_status()
                answer = resp.json()['choices'][0]['message']['content'].strip()
                return answer, f"[Groq Llama-3.3-70B]\n{thinking}"
            except Exception as e:
                logger.error(f"[RAG] Groq API call failed: {e}")

        # Fallback to local Ollama
        try:
            # Build standard Llama-3 instruction template
            prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            prompt += f"{system_instruction}\n\nDOCUMENT CONTEXT:\n{context}<|eot_id|>"

            for h in history[-4:]:
                role = h['role'].lower()
                prompt += f"<|start_header_id|>{role}<|end_header_id|>\n\n{h['content']}<|eot_id|>"

            prompt += f"<|start_header_id|>user<|end_header_id|>\n\n{question}<|eot_id|>"
            prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n"

            resp = requests.post(
                f"{settings.OLLAMA_HOST}/api/generate",
                json={
                    "model":  getattr(settings, "OLLAMA_CHAT_MODEL", "llama3.2:1b"),
                    "prompt": prompt,
                    "stream": False,
                    "options": {"num_predict": 800, "temperature": 0.2},
                },
                timeout=90,
            )
            resp.raise_for_status()
            answer = resp.json().get("response", "").strip()
            return answer, f"[Ollama Fallback]\n{thinking}"
        except Exception as e:
            logger.error(f"[RAG] Ollama LLM fallback error: {e}")
            return self._fallback_answer(question, context), f"[Rule-based Fallback]\n{thinking}"

    def _fallback_answer(self, question: str, context: str) -> str:
        """Rule-based fallback when both Groq and Ollama are unavailable."""
        q_lower = question.lower()
        q_words = set(re.findall(r'[a-zA-Z0-9]+', q_lower))
        stopwords = {
            'what', 'is', 'the', 'of', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'at', 
            'for', 'with', 'by', 'about', 'this', 'that', 'these', 'those', 'it', 'its', 
            'you', 'your', 'my', 'me', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 
            'their', 'we', 'us', 'our', 'are', 'was', 'were', 'be', 'been', 'being', 
            'have', 'has', 'had', 'do', 'does', 'did', 'who', 'how', 'where', 'when', 'why'
        }
        keywords = {w for w in q_words if w not in stopwords}
        if not keywords:
            keywords = q_words

        sentences = [s.strip() for s in re.split(r'\. |\n', context) if s.strip()]
        matches = []
        for s in sentences:
            if any(kw in s.lower() for kw in keywords):
                matches.append(s)

        if matches:
            clean_matches = [m for m in matches if not m.startswith('[Source')]
            if clean_matches:
                docs = list(set(re.findall(r"\[Source \d+: ([^\]\n]+)\]", context)))
                doc_cite = f"\n\nSource: {', '.join(docs)}" if docs else ""
                return f"Based on the retrieved document context:\n\n" + "\n".join(f"- {m}" for m in clean_matches[:5]) + doc_cite

        return "I could not find this in the available documents."

    def _score_confidence(self, answer: str, top_chunks: list) -> float:
        """Score answer confidence based on Cohere Rerank relevance scores and uncertainty indicators."""
        if not top_chunks:
            return 0.1
        
        # Use relevance score of the top chunk
        top_score = top_chunks[0].get("relevance_score", 0.5)

        # Reduce confidence if response indicates lack of answers
        uncertainty_phrases = ["i could not find", "not available", "unable to determine", "unclear", "not sure"]
        answer_lower = answer.lower()
        uncertainty = sum(1 for p in uncertainty_phrases if p in answer_lower)

        confidence = top_score - (uncertainty * 0.15)
        return round(max(0.1, min(1.0, confidence)), 2)

    def _detect_hallucinations(self, answer: str, context: str) -> list:
        """Basic hallucination detection — verify currency/numeric consistency."""
        flags = []
        answer_amounts  = set(re.findall(r"₹[\d,]+|\$[\d,]+", answer))
        context_amounts = set(re.findall(r"₹[\d,]+|\$[\d,]+", context))
        invented_amounts = answer_amounts - context_amounts
        if invented_amounts:
            flags.append(f"Amounts not found in source: {', '.join(list(invented_amounts)[:3])}")
        return flags
