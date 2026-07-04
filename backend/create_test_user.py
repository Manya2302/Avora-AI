import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.base')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

try:
    email = 'admin@avora.ai'
    password = 'admin123'
    # Django create_superuser usually takes (username, email, password) or just (email, password) depending on model
    # Let's check what fields are required. If custom user model uses email as username:
    user = User.objects.filter(email=email).first()
    if not user:
        try:
            user = User.objects.create_superuser(email=email, password=password)
        except TypeError:
            user = User.objects.create_superuser(username='admin', email=email, password=password)
        print(f"Created new superuser: Email: {email}, Password: {password}")
    else:
        user.set_password(password)
        user.save()
        print(f"Reset password for existing superuser: Email: {email}, Password: {password}")
except Exception as e:
    print(f"Error: {e}")
