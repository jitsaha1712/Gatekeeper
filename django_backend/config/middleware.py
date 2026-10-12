
import hmac
import os

from django.http import JsonResponse


class GatekeeperInternalKeyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Protect all blog and authentication API endpoints.
        if request.path == "/api" or request.path.startswith("/api/"):
            expected_key = os.environ.get("GATEKEEPER_INTERNAL_KEY")
            supplied_key = request.headers.get(
                "X-Gatekeeper-Internal-Key",
                "",
            )

            # Fail closed if the server key is not configured.
            if not expected_key:
                return JsonResponse(
                    {"detail": "Internal gateway key is not configured."},
                    status=503,
                )

            # Constant-time comparison of the supplied key.
            if not hmac.compare_digest(supplied_key, expected_key):
                return JsonResponse(
                    {"detail": "Request must pass through Gatekeeper."},
                    status=403,
                )

        return self.get_response(request)
