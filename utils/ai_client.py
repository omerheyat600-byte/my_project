"""
Unified AI provider client.

EduAdmin ships as an offline Windows .exe, so every AI Feature must work
two ways:
  1. "AI mode"      — a real call to whichever provider the school has
                       configured an API key for (OpenAI, Gemini, or
                       Anthropic), when there's internet + a key.
  2. "Offline mode" — a local, rule-based/template fallback that needs
                       neither internet nor a key, used automatically
                       when no key is configured or the API call fails.

This module only handles (1): it reads the configured provider from
school_settings, sends the prompt, and returns plain text. Callers
(the individual AI Feature services) decide what to do when this raises
AIProviderNotConfiguredError / AIProviderError — normally: fall back to
their own offline logic rather than surface a hard failure.
"""
import json
import requests

from utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "anthropic": "claude-3-5-sonnet-latest",
}

REQUEST_TIMEOUT = 45  # seconds — keep the UI from hanging forever on a bad connection


class AIProviderNotConfiguredError(Exception):
    pass


class AIProviderError(Exception):
    pass


def get_ai_config(settings_repository):
    """Reads ai_provider / ai_api_key_<provider> / ai_model_<provider>
    out of school_settings. Returns a dict; provider is '' if unset."""
    provider = (settings_repository.get_setting('ai_provider', '') or '').strip().lower()
    if provider not in ('openai', 'gemini', 'anthropic'):
        provider = ''
    api_key = settings_repository.get_setting(f'ai_api_key_{provider}', '') if provider else ''
    model = settings_repository.get_setting(f'ai_model_{provider}', '') if provider else ''
    return {
        "provider": provider,
        "api_key": (api_key or '').strip(),
        "model": (model or '').strip() or DEFAULT_MODELS.get(provider, ''),
    }


def is_configured(settings_repository):
    cfg = get_ai_config(settings_repository)
    return bool(cfg["provider"] and cfg["api_key"])


def call_ai(settings_repository, prompt, system=None, max_tokens=2000):
    """Send `prompt` (+ optional system instruction) to the configured
    provider and return the raw text response. Raises
    AIProviderNotConfiguredError if nothing is set up, or AIProviderError
    on any request/response failure — callers should catch both and fall
    back to offline generation rather than let these escape to the user
    as a hard error."""
    cfg = get_ai_config(settings_repository)
    if not cfg["provider"] or not cfg["api_key"]:
        raise AIProviderNotConfiguredError("No AI provider is configured in Settings")

    try:
        if cfg["provider"] == "openai":
            return _call_openai(cfg, prompt, system, max_tokens)
        if cfg["provider"] == "gemini":
            return _call_gemini(cfg, prompt, system, max_tokens)
        if cfg["provider"] == "anthropic":
            return _call_anthropic(cfg, prompt, system, max_tokens)
    except AIProviderError:
        raise
    except requests.exceptions.RequestException as e:
        raise AIProviderError(f"Network error contacting {cfg['provider']}: {e}")
    except Exception as e:
        raise AIProviderError(f"Unexpected error calling {cfg['provider']}: {e}")

    raise AIProviderNotConfiguredError("Unknown AI provider configured")


def _call_openai(cfg, prompt, system, max_tokens):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        },
        json={
            "model": cfg["model"] or DEFAULT_MODELS["openai"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.7,
        },
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code != 200:
        raise AIProviderError(f"OpenAI API error ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise AIProviderError(f"Unexpected OpenAI response shape: {data}")


def _call_gemini(cfg, prompt, system, max_tokens):
    model = cfg["model"] or DEFAULT_MODELS["gemini"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={cfg['api_key']}"

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    resp = requests.post(url, json=body, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise AIProviderError(f"Gemini API error ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError):
        raise AIProviderError(f"Unexpected Gemini response shape: {data}")


def _call_anthropic(cfg, prompt, system, max_tokens):
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": cfg["api_key"],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": cfg["model"] or DEFAULT_MODELS["anthropic"],
            "max_tokens": max_tokens,
            "system": system or "",
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code != 200:
        raise AIProviderError(f"Anthropic API error ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    try:
        return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
    except (KeyError, IndexError):
        raise AIProviderError(f"Unexpected Anthropic response shape: {data}")


def extract_json(text):
    """AI responses sometimes wrap JSON in prose or ```json fences —
    pull out the first {...} or [...] block and parse it."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    start_candidates = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if not start_candidates:
        raise ValueError("No JSON object/array found in AI response")
    start = min(start_candidates)

    end_obj, end_arr = text.rfind("}"), text.rfind("]")
    end = max(end_obj, end_arr)
    if end == -1 or end < start:
        raise ValueError("No JSON object/array found in AI response")

    return json.loads(text[start:end + 1])
