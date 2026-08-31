STAGING_SERVICES = ["frontend", "backend", "postgres"]

MONITORING_CHECKS = {
    "api_error_rate": "<2%",
    "ws_connection_success": ">=98%",
    "image_upload_success": ">=97%",
}

