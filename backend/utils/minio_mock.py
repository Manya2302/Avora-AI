import os
from io import BytesIO

class MockMinioResponse(BytesIO):
    def close(self):
        super().close()
    def release_conn(self):
        pass

class MockMinio:
    def __init__(self, *args, **kwargs):
        from django.conf import settings
        self.storage_dir = os.path.join(settings.MEDIA_ROOT, "minio_mock")
        os.makedirs(self.storage_dir, exist_ok=True)

    def bucket_exists(self, bucket_name: str) -> bool:
        return True

    def make_bucket(self, bucket_name: str):
        os.makedirs(os.path.join(self.storage_dir, bucket_name), exist_ok=True)

    def put_object(self, bucket_name: str, object_name: str, data, length: int, content_type: str = None):
        bucket_path = os.path.join(self.storage_dir, bucket_name)
        os.makedirs(bucket_path, exist_ok=True)
        file_path = os.path.join(bucket_path, object_name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'wb') as f:
            f.write(data.read())

    def get_object(self, bucket_name: str, object_name: str):
        file_path = os.path.join(self.storage_dir, bucket_name, object_name)
        if not os.path.exists(file_path):
            raise Exception(f"Object {object_name} not found in bucket {bucket_name}")
        with open(file_path, 'rb') as f:
            content = f.read()
        return MockMinioResponse(content)

    def remove_object(self, bucket_name: str, object_name: str):
        file_path = os.path.join(self.storage_dir, bucket_name, object_name)
        if os.path.exists(file_path):
            os.remove(file_path)
