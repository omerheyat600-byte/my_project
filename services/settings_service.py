"""
Settings service — business logic layer sitting between the settings
routes and the settings repository.
"""
from repositories.settings_repository import SettingsRepository
from utils.logger import get_logger

logger = get_logger(__name__)


class SettingsValidationError(Exception):
    pass


class SettingsService:

    def __init__(self, repository: SettingsRepository):
        self.repository = repository

    def get_settings(self):
        return {
            "school_name": self.repository.get_school_name(),
            "sms_alerts_enabled": self.repository.get_setting('sms_alerts_enabled', 'false'),
        }

    def update_settings(self, data):
        school_name = data.get('school_name')
        if not school_name:
            raise SettingsValidationError("School name is required")

        self.repository.set_school_name(school_name)
        logger.info(f"School settings updated: school_name={school_name}")

    def update_sms_alerts(self, enabled):
        value = 'true' if enabled else 'false'
        self.repository.set_setting('sms_alerts_enabled', value)
        logger.info(f"SMS alerts setting updated: {value}")

    # ==========================================================
    # AI PROVIDER CONFIGURATION
    # ==========================================================

    def get_ai_settings(self):
        provider = self.repository.get_setting('ai_provider', '')
        result = {"ai_provider": provider}
        for p in ('openai', 'gemini', 'anthropic'):
            key = self.repository.get_setting(f'ai_api_key_{p}', '') or ''
            # Never send the real key back to the browser — only whether
            # one is set, and a masked hint, so the Settings screen can't
            # leak it back out over the network/into logs.
            result[f'ai_api_key_{p}_set'] = bool(key)
            result[f'ai_api_key_{p}_hint'] = (f"••••{key[-4:]}" if len(key) >= 4 else ("••••" if key else ""))
            result[f'ai_model_{p}'] = self.repository.get_setting(f'ai_model_{p}', '') or ''
        return result

    def update_ai_settings(self, data):
        provider = (data.get('ai_provider') or '').strip().lower()
        if provider and provider not in ('openai', 'gemini', 'anthropic'):
            raise SettingsValidationError("Unknown AI provider")
        self.repository.set_setting('ai_provider', provider)

        for p in ('openai', 'gemini', 'anthropic'):
            api_key = data.get(f'ai_api_key_{p}')
            # Only overwrite a stored key if a new (non-empty) value was
            # actually submitted — the Settings form only ever sends a
            # masked hint back, never the real key, so an empty/omitted
            # field here always means "leave the stored key alone".
            if api_key:
                self.repository.set_setting(f'ai_api_key_{p}', api_key.strip())
            model = data.get(f'ai_model_{p}')
            if model is not None:
                self.repository.set_setting(f'ai_model_{p}', model.strip())

        logger.info(f"AI settings updated: provider={provider or '(none)'}")
