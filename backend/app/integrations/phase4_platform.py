PROVIDERS = {"maps": "mapbox", "media": "cloudinary"}
STATIC_EXPORT_TARGET = "android-webview"


def provider_ready(values: dict[str, str], required: tuple[str, ...]) -> bool:
    return all(values.get(key) for key in required)
