"""Transactional email delivery through a configured SMTP relay."""
import logging
import smtplib
from email.message import EmailMessage

from app.settings import get_settings

logger = logging.getLogger(__name__)


def send_email(recipient: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.error("Email not delivered: SMTP is not configured (recipient omitted)")
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
            client.ehlo()
            if settings.smtp_starttls:
                client.starttls()
                client.ehlo()
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password or "")
            client.send_message(message)
    except Exception:
        logger.exception("Email delivery failed (recipient omitted)")
