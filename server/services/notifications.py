# services/notifications.py
# Expo push notification sender

import logging

import httpx

from core import database as db
from core.config import get_settings

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send(
    user_id: str,
    title: str,
    body: str,
    data: dict | None = None,
):
    """
    Send a push notification to a user's device via Expo Push API.
    Reads the push token from the Turso settings table.
    """
    push_token = db.get_setting(user_id, "expo_push_token")
    if not push_token:
        logger.warning("No Expo push token found for user %s", user_id)
        return

    message = {
        "to": push_token,
        "title": title,
        "body": body,
        "sound": "default",
    }
    if data:
        message["data"] = data

    await _send_messages([message])


async def send_batch(notifications: list[dict]):
    """
    Send up to 100 notifications in a single Expo push API call.
    Each notification dict should have: user_id, title, body, data (optional).
    """
    messages = []
    for notif in notifications[:100]:
        push_token = db.get_setting(notif["user_id"], "expo_push_token")
        if not push_token:
            continue

        message = {
            "to": push_token,
            "title": notif["title"],
            "body": notif["body"],
            "sound": "default",
        }
        if notif.get("data"):
            message["data"] = notif["data"]
        messages.append(message)

    if messages:
        await _send_messages(messages)


async def _send_messages(messages: list[dict]):
    """Send messages via Expo Push API."""
    settings = get_settings()
    headers = {
        "Content-Type": "application/json",
    }
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers=headers,
            )
            response.raise_for_status()
            result = response.json()
            logger.info(
                "Sent %d push notification(s): %s",
                len(messages),
                result.get("data", []),
            )
    except Exception as e:
        logger.error("Failed to send push notifications: %s", e)
