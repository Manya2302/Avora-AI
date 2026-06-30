"""Avora AI — Phase 3 Training Pipeline (LoRA fine-tuning on user corrections)"""
import json, logging, os
from pathlib import Path
from django.conf import settings
logger = logging.getLogger(__name__)

TRAINING_DATA_DIR = Path(getattr(settings,"BASE_DIR","."))/  "ai_training_data"
FINETUNE_THRESHOLD = 50

class AvoraTrainingPipeline:
    def __init__(self):
        TRAINING_DATA_DIR.mkdir(parents=True, exist_ok=True)

    def record_correction(self, document_id, field, ai_value, human_value, doc_text_snippet, owner_id):
        sample = {"document_id":document_id,"field":field,"ai_prediction":ai_value,
                  "human_correct":human_value,"text_context":doc_text_snippet[:500],
                  "is_improvement": ai_value.strip().lower() != human_value.strip().lower()}
        path = TRAINING_DATA_DIR / f"corrections_{owner_id[:8]}.jsonl"
        with open(path,"a") as f: f.write(json.dumps(sample)+"\n")
        logger.info(f"[Training] Correction: {field}")
        self._check_trigger()

    def build_instruction_dataset(self) -> list:
        templates = {
            "vendor":"Extract the vendor name from this text.",
            "client":"Extract the client name from this text.",
            "total_amount":"Extract the total amount from this text.",
            "date":"Extract the primary document date.",
            "gstin":"Extract the GSTIN number.",
            "category":"Classify this document: invoice/contract/tax_filing/medical_record/bank_statement/certificate/audit_report/other.",
            "confidentiality":"Determine confidentiality: public/internal/confidential/restricted.",
            "summary":"Write a 1-sentence summary of this document.",
        }
        samples = []
        for f in TRAINING_DATA_DIR.glob("corrections_*.jsonl"):
            for line in open(f):
                try:
                    c = json.loads(line)
                    if not c.get("is_improvement"): continue
                    samples.append({"instruction":templates.get(c["field"],f"Extract {c['field']}."),"input":c["text_context"],"output":c["human_correct"]})
                except: continue
        out = TRAINING_DATA_DIR / "alpaca_dataset.json"
        with open(out,"w") as f: json.dump(samples,f,indent=2)
        logger.info(f"[Training] {len(samples)} samples → {out}")
        return samples

    def generate_synthetic_training_data(self) -> list:
        samples = [
            {"instruction":"Classify this document.","input":"INVOICE\nFrom: ABC Pvt Ltd\nGST: 18%\nTotal: ₹54,000","output":"invoice"},
            {"instruction":"Extract the vendor name.","input":"Invoice from: Reliance Industries Ltd\nDate: 15/03/2026","output":"Reliance Industries Ltd"},
            {"instruction":"Extract the total amount.","input":"Sub Total: ₹45,762\nGrand Total: ₹54,000","output":"54000"},
            {"instruction":"Determine confidentiality level.","input":"CONFIDENTIAL\nBoard Resolution — Acquisition","output":"confidential"},
            {"instruction":"Write a 1-sentence summary.","input":"This Agreement is between Company A and Vendor B for IT services for 3 years with auto-renewal unless terminated with 60 days notice.","output":"3-year IT services agreement with auto-renewal and 60-day termination notice."},
            {"instruction":"Extract the GSTIN.","input":"GSTIN: 29AABCT1332L1ZR\nPAN: AABCT1332L","output":"29AABCT1332L1ZR"},
            {"instruction":"Classify this document.","input":"MEDICAL CERTIFICATE\nPatient: Ravi Kumar\nDiagnosis: Viral Fever","output":"medical_record"},
            {"instruction":"Extract the expiry date.","input":"Certificate of Registration\nValid Until: 31/03/2027","output":"31/03/2027"},
        ]
        out = TRAINING_DATA_DIR / "synthetic_dataset.json"
        with open(out,"w") as f: json.dump(samples,f,indent=2)
        return samples

    def evaluate_extraction_quality(self, ai_result: dict, ground_truth: dict) -> dict:
        correct = total = 0
        field_scores = {}
        for field, tv in ground_truth.items():
            if not tv: continue
            av = str(ai_result.get(field,"")).strip().lower()
            tv = str(tv).strip().lower()
            ok = (av == tv or (len(tv)>4 and tv in av))
            field_scores[field] = {"correct":ok,"ai":av,"truth":tv}
            correct += int(ok); total += 1
        return {"accuracy":round(correct/total*100,1) if total else 0,"fields":field_scores}

    def _check_trigger(self):
        total = sum(1 for f in TRAINING_DATA_DIR.glob("corrections_*.jsonl") for _ in open(f))
        if total >= FINETUNE_THRESHOLD and total % FINETUNE_THRESHOLD == 0:
            logger.info(f"[Training] {total} corrections — triggering fine-tune")
            try:
                from celery import current_app
                current_app.send_task("apps.ai.engine.training_pipeline.trigger_finetune_job")
            except: pass

from celery import shared_task

@shared_task(name="apps.ai.engine.training_pipeline.trigger_finetune_job")
def trigger_finetune_job():
    p = AvoraTrainingPipeline()
    samples = p.build_instruction_dataset() + p.generate_synthetic_training_data()
    out = TRAINING_DATA_DIR / "merged_training.json"
    with open(out,"w") as f: json.dump(samples,f,indent=2)
    logger.info(f"[Training] {len(samples)} samples ready for fine-tuning → {out}")
