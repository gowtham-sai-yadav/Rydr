STAGING_SERVICES = ["frontend", "backend", "postgres"]\n\nMONITORING_CHECKS = {\n    "api_error_rate": "<2%",\n    "ws_connection_success": ">=98%",\n    "image_upload_success": ">=97%",\n}\n
