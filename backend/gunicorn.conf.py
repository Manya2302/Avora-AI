"""Gunicorn settings for production (gunicorn -c gunicorn.conf.py securevault.wsgi)."""
import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
# gthread: requests waiting on Groq/Cohere/Qdrant I/O don't block a whole worker process
worker_class = "gthread"
workers = int(os.getenv("GUNICORN_WORKERS", max(2, multiprocessing.cpu_count())))
threads = int(os.getenv("GUNICORN_THREADS", 8))
timeout = int(os.getenv("GUNICORN_TIMEOUT", 120))      # Copilot answers can take tens of seconds
graceful_timeout = 30
keepalive = 5
max_requests = 2000                                    # recycle workers: bounded memory growth
max_requests_jitter = 200
preload_app = True                                     # load Django once, fork workers (faster boot, shared memory)
accesslog = "-"
errorlog = "-"
forwarded_allow_ips = os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1")
