"""HTTP middleware."""
from django.middleware.gzip import GZipMiddleware


class SelectiveGZipMiddleware(GZipMiddleware):
    """
    Gzip API responses (document lists, graphs, search results shrink 5-10x, which
    is usually the biggest latency win on real networks).

    Skipped for /api/auth/ so responses carrying tokens are never compressed
    (removes any BREACH-style compression side channel), and for tiny bodies.
    """
    def process_response(self, request, response):
        if request.path.startswith("/api/auth/"):
            return response
        if not response.streaming and len(getattr(response, "content", b"")) < 1024:
            return response
        return super().process_response(request, response)
