STAGING_SERVICES = ("frontend", "backend", "postgres")
MONITORING_THRESHOLDS = {
    "api_error_rate": "<2%",
    "websocket_success": ">=98%",
    "upload_success": ">=97%",
}
