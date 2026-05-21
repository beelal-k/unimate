# celery_app.py
# Celery configuration for background task processing

import os

from celery import Celery
from dotenv import load_dotenv

load_dotenv()

celery = Celery(
    "unimate",
    broker=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    include=[
        "tasks.analyze_assignment",
        "tasks.embed_course_materials",
        "tasks.sync_submissions",
    ],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=600,  # kill task after 10 minutes
    task_soft_time_limit=540,  # warn at 9 minutes
    task_max_retries=2,
    task_default_retry_delay=30,
    # Avoid connection issues with Redis
    broker_connection_retry_on_startup=True,
)
