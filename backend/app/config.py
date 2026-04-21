from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://rydr:rydr_secret@localhost:5432/rydr"
    SECRET_KEY: str = "super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # M2 cost-calculator default — single env-tunable constant
    FUEL_PRICE_INR_PER_L: float = 105.0

    class Config:
        env_file = ".env"


settings = Settings()
