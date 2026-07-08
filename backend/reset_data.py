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
