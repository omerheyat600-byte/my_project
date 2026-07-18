import os
import re
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# ANDROID SMS GATEWAY (SMSGate) — sends SMS through an Android phone's own
# SIM + message bundle (e.g. a Jazz SMS package), over the local WiFi
# network. No internet or third-party SMS account required.
#
# Setup:
#   1. Install "SMS Gateway for Android" (a.k.a. SMSGate) on an Android
#      phone with the Jazz SIM: https://sms-gate.app/
#   2. In the app, turn on "Local Server" mode and start the server. It will
#      show a local IP address (e.g. 192.168.1.50), port (8080), and a
#      username/password for basic auth.
#   3. Set these three environment variables in the project's .env file:
#        SMSGATE_URL=http://<phone_local_ip>:8080/message
#        SMSGATE_USERNAME=<username from the app>
#        SMSGATE_PASSWORD=<password from the app>
#   4. Keep that phone powered on, connected to the same WiFi as the
#      server, and the app running with Local Server toggled on.
#
# If SMSGATE_URL is not set, send_sms() falls back to just logging the
# message (demo mode) so the app keeps working without any setup.
# --------------------------------------------------------------------------

def _normalize_pakistani_number(raw_phone: str) -> Optional[str]:
    """Convert common Pakistani phone formats to E.164 (+92XXXXXXXXXX)."""
    digits = re.sub(r'\D', '', raw_phone or '')
    if not digits:
        return None

    if digits.startswith('0092'):
        digits = digits[2:]          # 0092xxxxxxxxxx -> 92xxxxxxxxxx
    elif digits.startswith('92') and len(digits) == 12:
        pass                         # already 92xxxxxxxxxx
    elif digits.startswith('0') and len(digits) == 11:
        digits = '92' + digits[1:]   # 03xxxxxxxxx -> 923xxxxxxxxx
    elif len(digits) == 10:
        digits = '92' + digits       # 3xxxxxxxxx -> 923xxxxxxxxx

    if len(digits) != 12 or not digits.startswith('92'):
        return None
    return '+' + digits


def send_sms(phone_number: str, message: str) -> tuple[bool, Optional[str]]:
    """
    Sends an SMS. Returns (success, error_message).
    """
    phone = _normalize_pakistani_number(phone_number)
    if not phone:
        return False, "Invalid phone number"

    gateway_url = os.getenv('SMSGATE_URL')
    if not gateway_url:
        # Demo mode: no gateway configured yet, just log it.
        logger.info(f"📱 [DEMO] SMS to {phone}: {message}")
        return True, None

    username = os.getenv('SMSGATE_USERNAME')
    password = os.getenv('SMSGATE_PASSWORD')

    try:
        response = requests.post(
            gateway_url,
            auth=(username, password),
            headers={"Content-Type": "application/json"},
            json={
                "textMessage": {"text": message},
                "phoneNumbers": [phone],
            },
            timeout=15,
        )
        response.raise_for_status()
        logger.info(f"📱 SMS queued via SMSGate to {phone}")
        return True, None
    except requests.RequestException as e:
        logger.error(f"SMSGate send failed for {phone}: {e}")
        return False, str(e)
