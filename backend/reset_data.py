import os
import shutil
import django

# Set up Django environment so we can use its ORM
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.development')
django.setup()

from django.conf import settings
from apps.documents.models import Document
from apps.integrations.models import IntegrationConfig, SyncStatus

def reset_all_data():
    print("========================================")
    print("🚀 INITIALIZING COMPLETE PROJECT WIPE 🚀")
    print("========================================\n")
    
    # 1. DELETE DOCUMENTS FROM DATABASE (CASCADES TO EVERYTHING)
    print("1. Deleting all Document records from Database (cascade to chunks, metadata, analysis)...")
    try:
        count, _ = Document.objects.all().delete()
        print(f"   ✅ Deleted {count} total document-related records.")
    except Exception as e:
        print(f"   ❌ Failed to delete documents: {e}")

    # 1.5 DELETE DECOUPLED CONTRACT AND COMPLIANCE RECORDS
    print("1.5. Deleting decoupled Contract and Compliance records...")
    try:
        from apps.contracts.models import ContractAnalysis, ContractClause, ContractRisk, ContractRenewal
        from apps.compliance.models import ComplianceProfile, MissingDocument, ExpiryAlert, AuditPackage, ComplianceCopilotChat, ComplianceTimeline, ComplianceRisk, ComplianceCheckResult

        # Contracts
        ca_count, _ = ContractAnalysis.objects.all().delete()
        cc_count, _ = ContractClause.objects.all().delete()
        cr_count, _ = ContractRisk.objects.all().delete()
        cren_count, _ = ContractRenewal.objects.all().delete()
        
        # Compliance
        cp_count, _ = ComplianceProfile.objects.all().delete()
        md_count, _ = MissingDocument.objects.all().delete()
        ea_count, _ = ExpiryAlert.objects.all().delete()
        ap_count, _ = AuditPackage.objects.all().delete()
        ccc_count, _ = ComplianceCopilotChat.objects.all().delete()
        ct_count, _ = ComplianceTimeline.objects.all().delete()
        risk_count, _ = ComplianceRisk.objects.all().delete()
        chk_count, _ = ComplianceCheckResult.objects.all().delete()

        total_deleted = ca_count + cc_count + cr_count + cren_count + cp_count + md_count + ea_count + ap_count + ccc_count + ct_count + risk_count + chk_count
        print(f"   ✅ Deleted {total_deleted} decoupled contract and compliance records.")
    except Exception as e:
        print(f"   ❌ Failed to delete contract and compliance records: {e}")

    # 2. RESET INTEGRATION STATUSES
    print("2. Deep Resetting Integration tracking (Google Drive, GitHub, etc.)...")
    try:
        IntegrationConfig.objects.update(
            files_indexed=0, 
            status=SyncStatus.CONNECTED,
            last_sync_at=None,
            selected_folders=list(),
            sync_error=""
        )
        print("   ✅ Integrations completely reset (folders, timestamps, and files cleared).")
    except Exception as e:
        print(f"   ❌ Failed to reset integrations: {e}")

    # 3. WIPE QDRANT CLOUD COLLECTION
    print("3. Dropping collection from Qdrant Cloud...")
    try:
        from utils.qdrant_client import get_client
        client = get_client()
        client.delete_collection(settings.QDRANT_COLLECTION)
        print(f"   ✅ Qdrant collection '{settings.QDRANT_COLLECTION}' deleted.")
    except Exception as e:
        print(f"   ❌ Failed to delete Qdrant collection (it might not exist): {e}")

    # 4. DELETE LOCAL CHUNK VAULT STORAGE
    print("4. Wiping local MinIO/Vault storage directory...")
    try:
        storage_dir = getattr(settings, 'MINIO_STORAGE_MEDIA_BUCKET_NAME', 'vault')
        full_path = os.path.join(settings.BASE_DIR, storage_dir)
        if os.path.exists(full_path):
            shutil.rmtree(full_path)
            print(f"   ✅ Deleted physical file vault: {full_path}")
        else:
            print("   ✅ Physical file vault already empty.")
    except Exception as e:
        print(f"   ❌ Failed to delete local file storage: {e}")
        
    # 5. DELETE SYSTEM GENERATED LOGS
    print("5. Wiping system log files...")
    log_dirs = [
        os.path.join(settings.BASE_DIR, 'logs'),
        os.path.join(settings.BASE_DIR, 'celery_logs')
    ]
    for ld in log_dirs:
        if os.path.exists(ld):
            try:
                shutil.rmtree(ld)
                print(f"   ✅ Deleted logs at: {ld}")
            except Exception as e:
                print(f"   ❌ Failed to delete logs at {ld}: {e}")
        else:
            print(f"   ✅ No logs found at {ld}.")

    print("\n========================================")
    print("✨ PROJECT WIPE COMPLETED SUCCESSFULLY ✨")
    print("========================================")

if __name__ == '__main__':
    reset_all_data()
