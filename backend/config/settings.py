"""Settings for the stateless Spotter API."""

from __future__ import annotations

import os
from math import isfinite
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent


def load_local_env() -> None:
    """Load local development variables without overriding deployed environment values."""
    env_file = PROJECT_DIR / ".env"
    if not env_file.is_file():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        name, separator, value = line.partition("=")
        if not separator or not name or not name.replace("_", "").isalnum():
            continue
        os.environ.setdefault(name, value.strip().strip("\"'"))


load_local_env()


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]


IS_VERCEL = bool(os.getenv("VERCEL"))
DEBUG = env_bool("DJANGO_DEBUG", not IS_VERCEL)
LOCAL_SECRET_KEY = "spotter-local-development-only"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", LOCAL_SECRET_KEY).strip()
if not DEBUG and (SECRET_KEY == LOCAL_SECRET_KEY or len(SECRET_KEY) < 50):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a strong, unique value of at least 50 characters "
        "when DJANGO_DEBUG=false."
    )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,.vercel.app")

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES: list[dict[str, object]] = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# No application state is persisted. Leaving DATABASES empty also prevents an
# accidental dependency on SQLite in serverless deployments.
DATABASES: dict[str, dict[str, str]] = {}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", False)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "location_suggest": os.getenv("LOCATION_SUGGEST_RATE", "120/minute"),
        "trip_plan": os.getenv("TRIP_PLAN_RATE", "30/hour"),
    },
    "EXCEPTION_HANDLER": "trips.exceptions.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# HTTPS is terminated by the deployment proxy. Local development remains HTTP,
# while production defaults to secure redirects, cookies, and a one-year HSTS policy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "").strip()
# Demo routing is an explicit production choice. In local debug mode it remains
# the convenient default when no live key is configured.
USE_DEMO_PROVIDER = env_bool("USE_DEMO_PROVIDER", DEBUG and not bool(GEOAPIFY_API_KEY))
try:
    ROUTING_TIMEOUT_SECONDS = float(os.getenv("ROUTING_TIMEOUT_SECONDS", "12"))
except ValueError as exc:
    raise ImproperlyConfigured("ROUTING_TIMEOUT_SECONDS must be a positive number.") from exc
if not isfinite(ROUTING_TIMEOUT_SECONDS) or ROUTING_TIMEOUT_SECONDS <= 0:
    raise ImproperlyConfigured("ROUTING_TIMEOUT_SECONDS must be a positive number.")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
