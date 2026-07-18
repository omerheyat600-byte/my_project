"""
Centralized logging setup.

Every module (service layer, mainly) should get its logger the same way:

    from utils.logger import get_logger
    logger = get_logger(__name__)

so that log format, log file location, and log levels stay consistent
across the whole app as more modules (Teacher, Class, Fee, ...) are
migrated to this architecture.
"""
import logging

from config import LOG_FILE

_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_configured_loggers = set()


def get_logger(name):
    logger = logging.getLogger(name)

    if name not in _configured_loggers:
        logger.setLevel(logging.INFO)

        formatter = logging.Formatter(_FORMAT)

        file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        logger.propagate = False
        _configured_loggers.add(name)

    return logger
