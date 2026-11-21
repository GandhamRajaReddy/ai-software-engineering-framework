import time
import uuid
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.database import engine, Base
from app.api.v1.endpoints import router as items_router
from app.api.v1.schemas import ProblemDetails

setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # In development mode only, initialize tables if using SQLite or unmanaged local engine
    if engine:
        if settings.ENVIRONMENT == "development":
            logger.info("Dev mode: Verifying database tables via metadata create_all...")
            try:
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
            except Exception as exc:
                logger.warning(f"Database table verification skipped or driver missing: {exc}")
        else:
            logger.info("Test/Production mode: Schema is strictly managed via Alembic migrations.")
    else:
        logger.warning("Database engine not initialized (missing driver or config).")
        
    logger.info("Service initialized successfully.")
    yield
    logger.info("Shutting down service...")
    if engine:
        await engine.dispose()
    logger.info("Service connections cleanly disposed.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json"
)

# CORS: Enforce explicit origins; never wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Tenant-ID", "traceparent"],
)

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    # W3C Trace Context & Request ID extraction
    request_id = request.headers.get("X-Request-ID")
    if not request_id or len(request_id) > 64:
        request_id = str(uuid.uuid4())

    traceparent = request.headers.get("traceparent", "")
    trace_id = None
    if traceparent.startswith("00-") and len(traceparent.split("-")) >= 3:
        trace_id = traceparent.split("-")[1]

    start_time = time.time()
    response: Response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
    if trace_id:
        response.headers["X-Trace-ID"] = trace_id

    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.2f}ms)",
        extra={"request_id": request_id, "trace_id": trace_id}
    )
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=exc)
    problem = ProblemDetails(
        type="https://datatracker.ietf.org/doc/html/rfc7807",
        title="Internal Server Error",
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="An unexpected error occurred while processing the request.",
        instance=str(request.url)
    )
    return JSONResponse(status_code=500, content=problem.model_dump())

@app.get("/healthz", tags=["observability"])
async def liveness_probe():
    """Liveness probe: verifies process is alive."""
    return {"status": "ok"}

@app.get("/readyz", tags=["observability"])
async def readiness_probe():
    """Readiness probe: verifies database connection is ready to accept traffic."""
    if not engine:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "database": "disconnected", "error": "Database engine not initialized"}
        )
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as exc:
        logger.error(f"Readiness check failed: {str(exc)}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "database": "disconnected"}
        )

app.include_router(items_router, prefix="/api/v1")
