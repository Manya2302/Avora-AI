# Generated migration for GDriveSyncSession

import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0002_alter_integrationconfig_provider_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='GDriveSyncSession',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ('integration', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sync_sessions',
                    to='integrations.integrationconfig',
                )),
                # Pre-scan counts
                ('total_folders',     models.IntegerField(default=0)),
                ('total_files',       models.IntegerField(default=0)),
                ('supported_files',   models.IntegerField(default=0)),
                ('unsupported_files', models.IntegerField(default=0)),
                ('estimated_size_bytes', models.BigIntegerField(default=0)),
                # Live progress counters
                ('files_queued',      models.IntegerField(default=0)),
                ('files_downloading', models.IntegerField(default=0)),
                ('files_processing',  models.IntegerField(default=0)),
                ('files_embedding',   models.IntegerField(default=0)),
                ('files_completed',   models.IntegerField(default=0)),
                ('files_skipped',     models.IntegerField(default=0)),
                ('files_failed',      models.IntegerField(default=0)),
                # Phase tracking
                ('current_phase', models.CharField(max_length=30, default='queued')),
                # queued | scanning | downloading | extracting | embedding | completed | failed
                ('current_file', models.CharField(max_length=500, blank=True)),
                ('overall_status', models.CharField(max_length=20, default='running')),
                # running | completed | failed | cancelled
                ('error_log', models.JSONField(default=list)),
                ('elapsed_seconds', models.IntegerField(default=0)),
                ('started_at',  models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateTimeField(null=True, blank=True)),
            ],
            options={'db_table': 'gdrive_sync_sessions', 'ordering': ['-started_at']},
        ),
        migrations.CreateModel(
            name='GDriveFileStatus',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ('session', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='file_statuses',
                    to='integrations.gdrivesyncsession',
                )),
                ('gdrive_file_id',  models.CharField(max_length=200)),
                ('file_name',       models.CharField(max_length=500)),
                ('file_size',       models.BigIntegerField(default=0)),
                ('mime_type',       models.CharField(max_length=200, blank=True)),
                # queued | downloading | processing | ocr | embedding | completed | skipped | failed
                ('status',          models.CharField(max_length=20, default='queued')),
                ('error_message',   models.TextField(blank=True)),
                ('retry_count',     models.IntegerField(default=0)),
                ('file_hash',       models.CharField(max_length=64, blank=True)),
                ('is_duplicate',    models.BooleanField(default=False)),
                ('created_at',      models.DateTimeField(auto_now_add=True)),
                ('updated_at',      models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'gdrive_file_statuses', 'ordering': ['created_at']},
        ),
    ]
