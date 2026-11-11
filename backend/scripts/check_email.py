"""Send a one-off SMTP check message using the configured application settings."""
import argparse
import smtplib
import sys
from email.message import EmailMessage

from app.settings import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify SMTP configuration by sending a test email.")
    parser.add_argument("--to", required=True, help="Mailbox to receive the test message")
    args = parser.parse_args()
    settings = get_settings()

    if not settings.smtp_host or not settings.smtp_from_email:
        parser.error("SMTP_HOST and SMTP_FROM_EMAIL must be configured")
    if settings.smtp_ssl and settings.smtp_starttls:
        parser.error("Choose either SMTP_SSL or SMTP_STARTTLS, not both")

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = args.to
    message["Subject"] = "Acadex email delivery check"
    message.set_content("This is a test message from the Acadex email delivery check.")

    try:
        smtp_factory = smtplib.SMTP_SSL if settings.smtp_ssl else smtplib.SMTP
        with smtp_factory(settings.smtp_host, settings.smtp_port, timeout=20) as client:
            client.ehlo()
            if settings.smtp_starttls and not settings.smtp_ssl:
                client.starttls()
                client.ehlo()
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password or "")
            client.send_message(message)
        print(f"SMTP accepted the test message for {args.to}.")
    except smtplib.SMTPAuthenticationError:
        sys.exit("SMTP authentication failed. Check the account username and Google App Password.")
    except smtplib.SMTPConnectError:
        sys.exit("The SMTP server rejected the connection. Check SMTP host and port.")
    except (OSError, smtplib.SMTPException) as error:
        sys.exit(f"SMTP delivery check failed ({type(error).__name__}). Check API container logs for details.")


if __name__ == "__main__":
    main()
