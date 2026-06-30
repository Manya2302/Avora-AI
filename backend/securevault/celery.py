import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.development')

app = Celery('securevault')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
