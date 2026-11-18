"""
Tests for the v2 ingestion / retrieval logic.

Runs fully offline: Qdrant in-memory, embeddings forced to the local fallback,
no Cohere / Groq / Gemini calls.

    python manage.py test tests.test_ingestion_v2
"""
import os
import uuid
from unittest.mock import patch

import fitz
from django.test import TestCase, override_settings

from apps.ai.engine.chunker import chunk_pages, Chunk, TABLE_MAX_CHARS


# ── Chunker ──────────────────────────────────────────────────────────────

class ChunkerTests(TestCase):
    def _page(self, n, blocks, tables=None):
        return {"page": n, "blocks": blocks, "tables": tables or []}

    def _b(self, text, size=10.0, bold=False):
        return {"type": "text", "text": text, "size": size, "bold": bold, "chars": len(text)}

    def test_sections_pages_and_tables(self):
        body = "Revenue grew strongly in the northern region during the quarter. " * 12
        pages = [
            self._page(1, [self._b("1. Financial Overview", 18, True), self._b(body), self._b(body)]),
            self._page(2, [self._b(body), self._b("2. Risk Factors", 18, True), self._b(body)],
                       tables=[{"markdown": "| Region | Q1 |\n|---|---|\n| North | 10 |"}]),
        ]
        chunks = chunk_pages(pages)
        text_chunks = [c for c in chunks if c.chunk_type == "text"]
        self.assertTrue(any("Financial Overview" in c.section for c in text_chunks))
        self.assertTrue(any("Risk Factors" in c.section for c in text_chunks))
        # Risk-factor text must not be labelled as Financial Overview
        for c in text_chunks:
            if "2. Risk Factors" in c.content:
                self.assertIn("Risk Factors", c.section)
        table = [c for c in chunks if c.chunk_type == "table"]
        self.assertEqual(len(table), 1)
        self.assertEqual(table[0].page_start, 2)
        self.assertTrue(all(len(c.content) <= 2400 for c in text_chunks))

    def test_large_table_split_repeats_header(self):
        rows = "\n".join(f"| Vendor {i} | {i * 1000} |" for i in range(400))
        md = "| Vendor | Amount |\n|---|---|\n" + rows
        chunks = chunk_pages([self._page(5, [], [{"markdown": md}])])
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertIn("| Vendor | Amount |", c.content)
            self.assertLessEqual(len(c.content), TABLE_MAX_CHARS + 200)

    def test_embed_text_has_context_header(self):
        c = Chunk("Net profit was 42 crore.", "text", 12, 12, "Results › FY24")
        et = c.embed_text("Annual Report.pdf")
        self.assertIn("Document: Annual Report.pdf", et)
        self.assertIn("Section: Results › FY24", et)
        self.assertIn("Page: 12", et)


# ── PDF extraction (scanned-page detection, tables, figures) ─────────────

class ExtractorTests(TestCase):
    def test_tables_and_vector_chart_detected(self):
        from apps.ai.engine.page_extractor import extract_pdf, ExtractOptions
        import tempfile
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 60), "Quarterly Report", fontsize=18)
        page.insert_textbox(fitz.Rect(50, 80, 540, 200), "Body text about operations. " * 20, fontsize=10)
        # ruled table
        for r in range(4):
            page.draw_line((50, 220 + r * 20), (410, 220 + r * 20))
        for c in range(4):
            page.draw_line((50 + c * 120, 220), (50 + c * 120, 280))
        for r, row in enumerate([["Region", "Q1", "Q2"], ["North", "10", "20"], ["South", "30", "40"]]):
            for c, cell in enumerate(row):
                page.insert_text((55 + c * 120, 235 + r * 20), cell, fontsize=9)
        # vector chart
        page.draw_line((80, 700), (480, 700)); page.draw_line((80, 700), (80, 450))
        for i, v in enumerate([40, 90, 60, 120, 75, 30]):
            page.draw_rect(fitz.Rect(100 + i * 60, 700 - v, 140 + i * 60, 700), fill=(0.2, 0.4, 0.9))
        page.insert_text((80, 725), "Figure 1: Revenue by quarter", fontsize=9)
        fd, path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        doc.save(path)
        try:
            out = extract_pdf(path, ExtractOptions())
        finally:
            os.remove(path)
        p = out["pages"][0]
        self.assertEqual(out["ocr_pages"], 0)
        self.assertTrue(p["tables"], "ruled table should be extracted as markdown")
        self.assertIn("North", p["tables"][0]["markdown"])
        kinds = [f["kind"] for f in p["figures"]]
        self.assertIn("vector", kinds)
        fig = next(f for f in p["figures"] if f["kind"] == "vector")
        self.assertIn("Figure 1", fig["caption"])
        self.assertTrue(fig["image_png"].startswith(b"\x89PNG"))
        # table text is not duplicated in prose blocks
        self.assertFalse(any("South" in b["text"] for b in p["blocks"]))


# ── Role-based access + retrieval (in-memory Qdrant, offline embeddings) ─

@override_settings(COHERE_API_KEY=None, OLLAMA_HOST="http://127.0.0.1:9", VISION_PROVIDER="none",
                   QDRANT_COLLECTION="test_v2_collection",
                   CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                                       "LOCATION": "acl-tests"}})
class _OfflineFixtures(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        os.environ["COHERE_API_KEY"] = ""
        os.environ["OLLAMA_HOST"] = "http://127.0.0.1:9"

    def setUp(self):
        from qdrant_client import QdrantClient
        import utils.qdrant_client as qc
        import apps.ai.services.vector_store as vs
        from django.core.cache import cache
        from utils.circuit_breaker import ollama_embed_cb
        cache.clear()
        ollama_embed_cb.record_success()
        self._orig_client = qc._client
        qc._client = QdrantClient(":memory:")
        vs._ready = False

        from django.contrib.auth import get_user_model
        from apps.organizations.models import Department, OrgRole, OrgMember
        U = get_user_model()
        self.finance = Department.objects.create(name="Finance")
        self.hr = Department.objects.create(name="HR")
        r_ceo = OrgRole.objects.create(name="CEO", level=1)
        r_dir = OrgRole.objects.create(name="Finance Director", level=3, department=self.finance)
        r_analyst = OrgRole.objects.create(name="Analyst", level=7, department=self.finance)
        r_hr = OrgRole.objects.create(name="HR Exec", level=7, department=self.hr)

        def mk(email, dept, role):
            u = U.objects.create_user(email=email, password="x", full_name=email.split("@")[0])
            OrgMember.objects.create(user=u, department=dept, role=role)
            return u
        self.ceo = mk("ceo@t.io", None, r_ceo)
        self.director = mk("dir@t.io", self.finance, r_dir)
        self.analyst = mk("analyst@t.io", self.finance, r_analyst)
        self.analyst2 = mk("analyst2@t.io", self.finance, r_analyst)
        self.hr_user = mk("hr@t.io", self.hr, r_hr)

    def tearDown(self):
        import utils.qdrant_client as qc
        qc._client = self._orig_client

    def _doc(self, owner, name, text, visibility="private", depts=(), users=(), inherit=True):
        from apps.documents.models import Document, DocumentMetadata
        from apps.ai.models import DocumentOCR
        from apps.organizations.models import DocumentVisibility
        from apps.ai.engine.chunker import chunk_plain_text
        from apps.ai.services.vector_store import index_document_chunks
        d = Document.objects.create(owner=owner, original_name=name, storage_key=str(uuid.uuid4()),
                                    file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=d)
        DocumentOCR.objects.create(document_id=d.id, cleaned_text=text, raw_text=text, status="completed")
        v = DocumentVisibility.objects.create(document_id=d.id, owner=owner, visibility=visibility,
                                              inherit_upward=inherit)
        v.allowed_departments.set(depts)
        v.allowed_users.set(users)
        index_document_chunks(str(d.id), chunk_plain_text(text), category="finance")
        return d

    def _ids(self, user, q):
        from apps.ai.services.retrieval import retrieve_chunks
        return {c["document_id"] for c in retrieve_chunks([q], user=user)}

class AccessAndRetrievalTests(_OfflineFixtures):
    def test_rbac_rules(self):
        from apps.organizations.permissions import get_accessible_document_ids as acc
        private = self._doc(self.analyst, "private.pdf", "Analyst private payroll notes salary bands")
        dept = self._doc(self.analyst, "dept.pdf", "Finance department budget forecast", "department", [self.finance])
        org = self._doc(self.hr_user, "org.pdf", "Company holiday calendar", "organization")
        shared = self._doc(self.hr_user, "shared.pdf", "Offer letter for analyst", "user_share", users=[self.analyst2])

        self.assertEqual(acc(self.analyst), {str(private.id), str(dept.id), str(org.id)})
        self.assertEqual(acc(self.analyst2), {str(dept.id), str(org.id), str(shared.id)})
        self.assertEqual(acc(self.hr_user), {str(org.id), str(shared.id)})
        # Director (level 3, same dept, higher rank) inherits the analyst's private doc
        self.assertIn(str(private.id), acc(self.director))
        self.assertNotIn(str(shared.id), acc(self.director))
        # CEO (level 1) inherits across departments
        self.assertTrue({str(private.id), str(shared.id)} <= acc(self.ceo))

    def test_cache_invalidated_on_visibility_change(self):
        from apps.organizations.permissions import get_accessible_document_ids as acc
        from apps.organizations.models import DocumentVisibility
        d = self._doc(self.analyst, "plan.pdf", "Strategic plan", inherit=False)
        self.assertNotIn(str(d.id), acc(self.hr_user))
        v = DocumentVisibility.objects.get(document_id=d.id)
        v.visibility = "organization"
        v.save()
        self.assertIn(str(d.id), acc(self.hr_user))

    def test_retrieval_respects_roles(self):
        private = self._doc(self.analyst, "private.pdf", "Confidential payroll salary bands for analysts",
                            inherit=False)
        dept = self._doc(self.analyst, "dept.pdf", "Finance department payroll budget forecast", "department",
                         [self.finance])
        q = "payroll salary budget"
        self.assertEqual(self._ids(self.analyst, q), {str(private.id), str(dept.id)})
        self.assertEqual(self._ids(self.analyst2, q), {str(dept.id)})       # same dept, not private
        self.assertEqual(self._ids(self.hr_user, q), set())                 # other dept: nothing

    def test_keyword_probe_and_page_metadata(self):
        d = self._doc(self.analyst, "inv.pdf", "Invoice INV-2024-0113 total due 4,52,000 payable to Acme Corp")
        from apps.ai.services.retrieval import retrieve_chunks
        res = retrieve_chunks(["what is the amount on INV-2024-0113"], user=self.analyst)
        self.assertTrue(res)
        self.assertEqual(res[0]["document_id"], str(d.id))
        self.assertIn("INV-2024-0113", res[0]["text"])

    def test_delete_removes_all_points(self):
        from apps.ai.services.vector_store import delete_document_points
        d = self._doc(self.analyst, "gone.pdf", "Quarterly vendor compliance review findings")
        self.assertIn(str(d.id), self._ids(self.analyst, "vendor compliance"))
        delete_document_points(str(d.id))
        self.assertNotIn(str(d.id), self._ids(self.analyst, "vendor compliance"))

    def test_reindex_replaces_old_chunks(self):
        from apps.ai.engine.chunker import chunk_plain_text
        from apps.ai.services.vector_store import index_document_chunks
        from utils.qdrant_client import get_client
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        long_text = "\n\n".join(f"Paragraph {i} about warehouse logistics and inventory." * 6 for i in range(40))
        d = self._doc(self.analyst, "v1.pdf", long_text)
        index_document_chunks(str(d.id), chunk_plain_text("Short replacement text."), replace=True)
        n = get_client().count("test_v2_collection", count_filter=Filter(must=[
            FieldCondition(key="document_id", match=MatchValue(value=str(d.id)))])).count
        self.assertEqual(n, 2)  # 1 chunk + 1 document-level point


# ── End-to-end ingestion (encrypted chunks → extraction → Qdrant → RAG retrieval) ─

class EndToEndIngestionTests(_OfflineFixtures):
    """Reuses the offline fixtures above; runs the real IngestionPipeline."""

    def test_pipeline_pdf_with_table_and_chart(self):
        from apps.documents.models import Document, DocumentMetadata, DocumentEncryptionKey, DocumentChunk
        from apps.documents.services.encryption import generate_aes_key, encrypt_chunk
        from apps.documents.services.compression import compress
        from apps.documents.services.storage import upload_chunk
        from apps.ai.models import DocumentOCR, AIProcessingQueue
        from apps.ai.services.ingestion import IngestionPipeline
        from apps.ai.services.retrieval import retrieve_chunks

        pdf = fitz.open()
        for i in range(1, 13):
            p = pdf.new_page()
            p.insert_text((50, 60), f"{i}. Section {i}", fontsize=18)
            p.insert_textbox(fitz.Rect(50, 80, 540, 400),
                             f"Page {i} discusses procurement policy and vendor onboarding controls. " * 8, fontsize=10)
        pg = pdf[5]
        pg.draw_line((80, 700), (480, 700)); pg.draw_line((80, 700), (80, 450))
        for k, v in enumerate([40, 90, 60, 120, 75, 30]):
            pg.draw_rect(fitz.Rect(100 + k * 60, 700 - v, 140 + k * 60, 700), fill=(0.2, 0.4, 0.9))
        pg.insert_text((80, 725), "Figure 2: Warehouse throughput by month", fontsize=9)
        data = pdf.tobytes()

        doc = Document.objects.create(owner=self.analyst, original_name="policy.pdf",
                                      storage_key=str(uuid.uuid4()), file_extension="pdf",
                                      mime_type="application/pdf", total_chunks=2, status="processing")
        DocumentMetadata.objects.create(document=doc)
        key = generate_aes_key()
        DocumentEncryptionKey.objects.create(document=doc, encrypted_aes_key=key, rsa_public_key_ref="t")
        half = len(data) // 2
        for idx, part in enumerate([data[:half], data[half:]]):
            enc = encrypt_chunk(compress(part), key)
            sk = f"chunks/{doc.id}/{idx}.enc"
            upload_chunk(sk, enc["ciphertext"])
            DocumentChunk.objects.create(document=doc, chunk_index=idx, storage_key=sk,
                                         chunk_size=len(enc["ciphertext"]), sha256_hash=enc["sha256_hash"],
                                         iv=enc["iv"], tag=enc["tag"], upload_status="done")

        with patch("apps.ai.services.classification.classify_document_v2",
                   return_value={"category": "policy", "confidentiality": "internal"}):
            out = IngestionPipeline(str(doc.id)).run()

        doc.refresh_from_db()
        self.assertEqual(doc.status, "ai_ready")
        self.assertEqual(out["page_count"], 12)
        self.assertEqual(AIProcessingQueue.objects.get(document_id=doc.id).progress, 100)
        ocr = DocumentOCR.objects.get(document_id=doc.id)
        self.assertIn("Warehouse throughput", ocr.cleaned_text)     # figure text reaches analysers
        self.assertGreaterEqual(out["stats"].get("figure_chunks", 0), 1)

        res = retrieve_chunks(["warehouse throughput chart"], user=self.analyst)
        self.assertTrue(res)
        fig = [c for c in res if c["chunk_type"] == "figure"]
        self.assertTrue(fig, "figure chunk should be retrievable")
        self.assertEqual(fig[0]["page_start"], 6)
        self.assertNotIn("[Encrypted", fig[0]["text"])               # stored encrypted, decrypted on read
        self.assertEqual(retrieve_chunks(["warehouse throughput chart"], user=self.hr_user), [])
