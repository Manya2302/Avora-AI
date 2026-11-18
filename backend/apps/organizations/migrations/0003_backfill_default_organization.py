"""
Backfill: put every existing department, role and user into one "Default Organization".
This keeps today's single-company behaviour exactly (everyone who could see an
organization-wide document still can), while giving every record a tenant.
"""
from django.conf import settings
from django.db import migrations


def forwards(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Department = apps.get_model("organizations", "Department")
    OrgRole = apps.get_model("organizations", "OrgRole")
    OrgMember = apps.get_model("organizations", "OrgMember")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))

    if not (User.objects.exists() or Department.objects.exists()):
        return  # fresh database: organizations are created on demand
    org = Organization.objects.order_by("created_at").first() or Organization.objects.create(name="Default Organization")
    Department.objects.filter(organization__isnull=True).update(organization=org)
    OrgRole.objects.filter(organization__isnull=True).update(organization=org)
    OrgMember.objects.filter(organization__isnull=True).update(organization=org)
    have = set(OrgMember.objects.values_list("user_id", flat=True))
    OrgMember.objects.bulk_create(
        [OrgMember(user_id=uid, organization=org) for uid in User.objects.exclude(id__in=have).values_list("id", flat=True)],
        batch_size=500,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0002_organization_tenancy"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
