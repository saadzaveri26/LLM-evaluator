from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ollama_host: str = "http://localhost:11434"
    judge_provider: str = "ollama"
    judge_model: str = "gemma4"
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    cross_judge_provider: str = "groq"
    cross_judge_model: str = ""
    gemini_api_key: str = ""
    db_path: str = "modelfit.db"
    cors_origin: str = "http://localhost:3000"


settings = Settings()
