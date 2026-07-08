"""
create_qdrant_indexes.py
────────────────────────
Creates payload indexes on the Qdrant collection for all fields used in
must-filters across the hybrid search pipeline.

Without these indexes, Qdrant Cloud returns:
  400 Bad Request: "Index required but not found for 'owner_id'"

Fields indexed:
  owner_id        -> uuid/keyword  (permission filter)
  document_id     -> keyword       (lookup by doc)
  category        -> keyword       (metadata filter)
  confidentiality -> keyword       (access filter)
  chunk_index     -> integer       (ordering)

Run once:
  cd backend
  .\\venv\\Scripts\\python create_qdrant_indexes.py
"""

import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.development')
django.setup()

from django.conf import settings
from utils.qdrant_client import get_client
from qdrant_client.models import PayloadSchemaType, TextIndexParams, TokenizerType

COLLECTION = settings.QDRANT_COLLECTION

KEYWORD_FIELDS = [
    "owner_id",
    "document_id",
    "category",
    "confidentiality",
    "original_name",
    "file_type",
    "department",
]

INTEGER_FIELDS = [
    "chunk_index",
]

def main():
    client = get_client()

    # Verify collection exists
    try:
        info = client.get_collection(COLLECTION)
        print(f"[OK] Collection '{COLLECTION}' found - {info.points_count} points")
    except Exception as e:
        print(f"[FAIL] Collection not found: {e}")
        sys.exit(1)

    # Create keyword indexes
    for field in KEYWORD_FIELDS:
        try:
            client.create_payload_index(
                collection_name=COLLECTION,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
            )
            print(f"  [CREATED] Keyword index: {field}")
        except Exception as e:
            if "already exists" in str(e).lower() or "conflict" in str(e).lower():
                print(f"  [EXISTS]  Keyword index: {field}")
            else:
                print(f"  [FAILED]  {field}: {e}")

    # Create integer indexes
    for field in INTEGER_FIELDS:
        try:
            client.create_payload_index(
                collection_name=COLLECTION,
                field_name=field,
                field_schema=PayloadSchemaType.INTEGER,
            )
            print(f"  [CREATED] Integer index: {field}")
        except Exception as e:
            if "already exists" in str(e).lower() or "conflict" in str(e).lower():
                print(f"  [EXISTS]  Integer index: {field}")
            else:
                print(f"  [FAILED]  {field}: {e}")

    print("\n[DONE] All indexes processed. Qdrant payload filtering is now enabled.")

if __name__ == "__main__":
    main()
