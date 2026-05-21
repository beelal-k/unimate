# core/exceptions.py
# Custom exception hierarchy for structured error handling

from fastapi import HTTPException, status


class AppException(HTTPException):
    """Base application exception."""

    def __init__(
        self,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error: str = "InternalError",
        message: str = "An unexpected error occurred",
        details: dict | None = None,
    ):
        self.error = error
        self.message = message
        self.details = details or {}
        super().__init__(
            status_code=status_code,
            detail={
                "error": self.error,
                "message": self.message,
                "details": self.details,
            },
        )


class AuthenticationError(AppException):
    def __init__(self, message: str = "Invalid or expired Moodle token"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="AuthenticationFailed",
            message=message,
        )


class MoodleAPIError(AppException):
    def __init__(self, message: str = "Moodle API request failed"):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            error="MoodleAPIError",
            message=message,
        )


class GeminiError(AppException):
    def __init__(self, message: str = "Gemini API request failed"):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            error="GeminiError",
            message=message,
        )


class JobNotFoundError(AppException):
    def __init__(self, job_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error="JobNotFound",
            message=f"Job {job_id} not found",
            details={"jobId": job_id},
        )


class ForbiddenError(AppException):
    def __init__(self, message: str = "You do not have access to this resource"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            error="Forbidden",
            message=message,
        )


class RateLimitExceededError(AppException):
    def __init__(self, message: str, retry_after: int = 3600):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error="RateLimitExceeded",
            message=message,
            details={"retryAfter": retry_after},
        )


class ServiceUnavailableError(AppException):
    def __init__(self, message: str = "Service temporarily unavailable"):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error="ServiceUnavailable",
            message=message,
        )
