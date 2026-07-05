import os
import pytest
import responses
import requests
from unittest.mock import patch, MagicMock

from apps.ai.services.embeddings import generate_embedding, generate_embeddings_batch
from apps.copilot.services.rag_engine import AvoraRAGEngine
from utils.circuit_breaker import cohere_embed_cb, cohere_rerank_cb, groq_cb

@pytest.fixture(autouse=True)
def reset_circuit_breakers():
    cohere_embed_cb.record_success()
    cohere_rerank_cb.record_success()
    groq_cb.record_success()
    yield

@responses.activate
@patch("os.getenv")
def test_cohere_embedding_success(mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "COHERE_API_KEY" else d
    responses.add(
        responses.POST, "https://api.cohere.ai/v1/embed",
        json={"embeddings": [[0.5] * 1024]}, status=200
    )
    vec = generate_embedding("hello")
    assert vec == [0.5] * 1024
    assert cohere_embed_cb.is_healthy()

@responses.activate
@patch("os.getenv")
def test_cohere_embedding_failure_triggers_fallback(mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "COHERE_API_KEY" else d
    responses.add(
        responses.POST, "https://api.cohere.ai/v1/embed",
        json={"message": "error"}, status=500
    )
    # Mock Ollama success
    responses.add(
        responses.POST, "http://localhost:11434/api/embeddings",
        json={"embedding": [0.1] * 1024}, status=200
    )
    vec = generate_embedding("hello")
    assert vec == [0.1] * 1024
    assert cohere_embed_cb.failures == 1

@responses.activate
@patch("os.getenv")
def test_circuit_breaker_activation(mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "COHERE_API_KEY" else d
    responses.add(
        responses.POST, "https://api.cohere.ai/v1/embed",
        json={"message": "error"}, status=500
    )
    responses.add(
        responses.POST, "http://localhost:11434/api/embeddings",
        json={"embedding": [0.1] * 1024}, status=200
    )
    
    for _ in range(3):
        generate_embedding("test")
        
    assert not cohere_embed_cb.is_healthy()
    assert cohere_embed_cb.state == "OPEN"

@responses.activate
@patch("os.getenv")
def test_circuit_breaker_recovery(mock_getenv):
    cohere_embed_cb.state = "HALF_OPEN"
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "COHERE_API_KEY" else d
    
    responses.add(
        responses.POST, "https://api.cohere.ai/v1/embed",
        json={"embeddings": [[0.5] * 1024]}, status=200
    )
    
    generate_embedding("test")
    assert cohere_embed_cb.state == "CLOSED"
    assert cohere_embed_cb.is_healthy()

@responses.activate
@patch("os.getenv")
def test_groq_success(mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "GROQ_API_KEY" else d
    responses.add(
        responses.POST, "https://api.groq.com/openai/v1/chat/completions",
        json={"choices": [{"message": {"content": "Hello"}}]}, status=200
    )
    
    engine = AvoraRAGEngine()
    ans, thinking = engine._generate_answer("hi", "context", "document", [])
    assert ans == "Hello"
    assert "Groq Llama-3.3-70B" in thinking
    assert groq_cb.is_healthy()

@responses.activate
@patch("os.getenv")
def test_groq_failure_triggers_qwen(mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "GROQ_API_KEY" else d
    responses.add(
        responses.POST, "https://api.groq.com/openai/v1/chat/completions",
        json={"message": "error"}, status=429
    )
    # Mock Ollama Qwen success
    responses.add(
        responses.POST, "http://localhost:11434/api/generate",
        json={"response": "Qwen says hi"}, status=200
    )
    
    engine = AvoraRAGEngine()
    ans, thinking = engine._generate_answer("hi", "context", "document", [])
    assert ans == "Qwen says hi"
    assert "Qwen" in thinking
    assert groq_cb.failures == 1

@responses.activate
@patch("os.getenv")
@patch("apps.copilot.services.rag_engine.AvoraRAGEngine._fallback_bge_rerank")
def test_cohere_rerank_failure_triggers_bge(mock_bge, mock_getenv):
    mock_getenv.side_effect = lambda k, d=None: "dummy_key" if k == "COHERE_API_KEY" else d
    mock_bge.return_value = ([], [])
    responses.add(
        responses.POST, "https://api.cohere.com/v1/rerank",
        json={"message": "timeout"}, status=504
    )
    
    engine = AvoraRAGEngine()
    engine._rerank_chunks([{"text": "t", "document_id": "1"}], "q")
    
    assert mock_bge.called
    assert cohere_rerank_cb.failures == 1
