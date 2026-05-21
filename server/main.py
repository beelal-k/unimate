# main.py
# FastAPI application entry point

import logging
import traceback
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.middleware.auth import close_redis
from api.middleware.rate_limit import check_rate_limit
from api.routes import embeddings, health, jobs
from core.database import create_tables
from core.exceptions import AppException

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    logger.info("Starting UniMate Backend...")
    create_tables()
    logger.info("Database tables ensured")
    yield
    # Shutdown
    await close_redis()
    logger.info("UniMate Backend shut down cleanly")


app = FastAPI(
    title="UniMate Backend",
    description="FastAPI server for assignment analysis, RAG pipelines, and AI-powered draft generation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins in development, restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers — rate limiting applied to all authenticated routes
app.include_router(health.router)
app.include_router(jobs.router, dependencies=[Depends(check_rate_limit)])
app.include_router(embeddings.router, dependencies=[Depends(check_rate_limit)])


# ---------------------------------------------------------------------------
#  Global exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle custom application exceptions."""
    logger.warning(
        "AppException [%s] %s: %s",
        exc.status_code,
        exc.error,
        exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch all unhandled exceptions.
    Log the full traceback server-side, return a safe 500 to the client.
    """
    logger.error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method,
        request.url.path,
        exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred. Please try again later.",
            "details": {},
        },
    )


# ---------------------------------------------------------------------------
#  Request logging middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request at INFO level (without sensitive headers)."""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "→ %s %s [user=%s]",
        request.method,
        request.url.path,
        user_id,
    )
    response = await call_next(request)
    logger.info(
        "← %s %s → %d",
        request.method,
        request.url.path,
        response.status_code,
    )
    return response
