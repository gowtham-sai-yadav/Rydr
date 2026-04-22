from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://rydr:rydr_secret@localhost:5432/rydr"
    SECRET_KEY: str = "super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # M2 cost-calculator default — single env-tunable constant
    FUEL_PRICE_INR_PER_L: float = 105.0

    # M4 Cloudinary integration — empty defaults serve as a feature flag.
    # When any of these is empty, the signed-upload endpoint returns 503 and
    # the rest of the post-ride capture flow keeps working (URL confirm path).
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    # Free-tier size ceilings, surfaced to the client in the sign response.
    CLOUDINARY_MAX_IMAGE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    CLOUDINARY_MAX_VIDEO_BYTES: int = 100 * 1024 * 1024  # 100 MB

    class Config:
        env_file = ".env"


settings = Settings()
