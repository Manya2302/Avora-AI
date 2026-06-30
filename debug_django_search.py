import os
import sys
import django

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.development')
django.setup()

from apps.ai.views import SemanticSearchView
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

User = get_user_model()
u = User.objects.get(email='admin@securevault.ai')

factory = APIRequestFactory()
request = factory.post('/api/ai/search/', {'query': "nexus ai 's system overview ?", 'top_k': 12}, format='json')
force_authenticate(request, user=u)

print("Calling SemanticSearchView.post directly...")
view = SemanticSearchView.as_view()
try:
    resp = view(request)
    print("Response Status:", resp.status_code)
    print("Response Data:", resp.data)
except Exception as e:
    import traceback
    traceback.print_exc()
