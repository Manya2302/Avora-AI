import time
import logging
import os
from threading import Lock

try:
    from prometheus_client import Counter, Gauge
    CB_STATE = Gauge('circuit_breaker_state', 'Circuit breaker state (1=CLOSED, 0=OPEN/HALF)', ['service'])
    FALLBACK_COUNT = Counter('fallback_usage_total', 'Total number of fallback events', ['service'])
    API_FAILURE_COUNT = Counter('api_failure_total', 'Total number of cloud API failures', ['service'])
    metrics_enabled = True
except ImportError:
    metrics_enabled = False

logger = logging.getLogger(__name__)

class CircuitBreaker:
    def __init__(self, name: str, max_failures: int = 3, cooldown_seconds: int = 300):
        self.name = name
        self.max_failures = max_failures
        self.cooldown_seconds = cooldown_seconds
        self.failures = 0
        self.last_failure_time = 0
        self._lock = Lock()
        self.state = "CLOSED"  # CLOSED = Normal, OPEN = Fallback, HALF_OPEN = Testing recovery

    def is_healthy(self) -> bool:
        with self._lock:
            if self.state == "CLOSED":
                return True
            if self.state == "OPEN":
                # Check if cooldown is over
                if time.time() - self.last_failure_time > self.cooldown_seconds:
                    self.state = "HALF_OPEN"
                    if metrics_enabled: CB_STATE.labels(service=self.name).set(0)
                    logger.info(f"Circuit Breaker: {self.name} testing recovery (HALF_OPEN)")
                    return True
                if metrics_enabled: FALLBACK_COUNT.labels(service=self.name).inc()
                return False
            # HALF_OPEN: allow request to pass through to test
            return True

    def record_success(self):
        with self._lock:
            if self.state != "CLOSED":
                logger.info(f"Circuit Breaker: {self.name} recovered (CLOSED)")
            self.failures = 0
            self.state = "CLOSED"
            if metrics_enabled: CB_STATE.labels(service=self.name).set(1)

    def record_failure(self):
        with self._lock:
            self.failures += 1
            self.last_failure_time = time.time()
            if metrics_enabled: API_FAILURE_COUNT.labels(service=self.name).inc()
            
            if self.failures >= self.max_failures:
                if self.state != "OPEN":
                    logger.warning(f"Circuit Breaker: {self.name} temporarily disabled")
                self.state = "OPEN"
                if metrics_enabled: CB_STATE.labels(service=self.name).set(0)
            elif self.state == "HALF_OPEN":
                self.state = "OPEN"
                if metrics_enabled: CB_STATE.labels(service=self.name).set(0)
                logger.warning(f"Circuit Breaker: {self.name} recovery failed, reopening")

# Global instances
def get_timeout():
    return int(os.getenv("CIRCUIT_BREAKER_TIMEOUT", 300))

cohere_embed_cb = CircuitBreaker("Cohere Embeddings", cooldown_seconds=get_timeout())
cohere_rerank_cb = CircuitBreaker("Cohere Reranker", cooldown_seconds=get_timeout())
groq_cb = CircuitBreaker("Groq", cooldown_seconds=get_timeout())
