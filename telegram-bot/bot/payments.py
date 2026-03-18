from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

import httpx

from .config import Config


class PaymentService:
    def __init__(self, config: Config) -> None:
        self.enabled = bool(config.yookassa_shop_id and config.yookassa_secret_key)
        self.shop_id = config.yookassa_shop_id or ""
        self.secret_key = config.yookassa_secret_key or ""
        self.return_url = config.yookassa_return_url
        self._client: Optional[httpx.AsyncClient] = None
        if self.return_url and "t.me/" in self.return_url:
            logging.warning(
                "YOOKASSA_RETURN_URL points to Telegram. If payment creation fails, use a normal website URL instead."
            )
        if self.enabled:
            self._client = httpx.AsyncClient(
                base_url="https://api.yookassa.ru/v3",
                auth=(self.shop_id, self.secret_key),
                timeout=15.0,
            )

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    async def create_payment(
        self,
        amount_rub: int,
        description: str,
        metadata: Optional[Dict[str, Any]] = None,
        save_payment_method: bool = True,
    ) -> tuple[Dict[str, Any], str]:
        if not self.enabled or not self._client:
            raise RuntimeError("Payments are not configured")
        if not self.return_url:
            raise RuntimeError("YOOKASSA_RETURN_URL is required for redirect payments")
        idempotence_key = uuid.uuid4().hex
        payload: Dict[str, Any] = {
            "amount": {"value": _format_amount(amount_rub), "currency": "RUB"},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": self.return_url},
            "description": description,
        }
        if save_payment_method:
            payload["save_payment_method"] = True
        if metadata:
            payload["metadata"] = _normalize_metadata(metadata)
        try:
            response = await self._client.post(
                "/payments",
                json=payload,
                headers={"Idempotence-Key": idempotence_key},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logging.error(
                "YooKassa create_payment failed status=%s return_url=%s amount_rub=%s save_payment_method=%s body=%s",
                exc.response.status_code,
                self.return_url,
                amount_rub,
                save_payment_method,
                _safe_response_text(exc.response),
            )
            raise
        except httpx.RequestError as exc:
            logging.exception("YooKassa create_payment request error: %s", exc)
            raise
        data = response.json()
        if not ((data.get("confirmation") or {}).get("confirmation_url")):
            logging.error(
                "YooKassa create_payment returned without confirmation_url payment_id=%s status=%s body=%s",
                data.get("id"),
                data.get("status"),
                _safe_response_text(response),
            )
        return data, idempotence_key

    async def create_recurring_payment(
        self,
        amount_rub: int,
        description: str,
        payment_method_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> tuple[Dict[str, Any], str]:
        if not self.enabled or not self._client:
            raise RuntimeError("Payments are not configured")
        idempotence_key = uuid.uuid4().hex
        payload: Dict[str, Any] = {
            "amount": {"value": _format_amount(amount_rub), "currency": "RUB"},
            "capture": True,
            "payment_method_id": payment_method_id,
            "description": description,
        }
        if metadata:
            payload["metadata"] = _normalize_metadata(metadata)
        try:
            response = await self._client.post(
                "/payments",
                json=payload,
                headers={"Idempotence-Key": idempotence_key},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logging.error(
                "YooKassa create_recurring_payment failed status=%s amount_rub=%s body=%s",
                exc.response.status_code,
                amount_rub,
                _safe_response_text(exc.response),
            )
            raise
        except httpx.RequestError as exc:
            logging.exception("YooKassa create_recurring_payment request error: %s", exc)
            raise
        return response.json(), idempotence_key

    async def get_payment(self, payment_id: str) -> Dict[str, Any]:
        if not self.enabled or not self._client:
            raise RuntimeError("Payments are not configured")
        try:
            response = await self._client.get(f"/payments/{payment_id}")
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logging.error(
                "YooKassa get_payment failed payment_id=%s status=%s body=%s",
                payment_id,
                exc.response.status_code,
                _safe_response_text(exc.response),
            )
            raise
        except httpx.RequestError as exc:
            logging.exception("YooKassa get_payment request error: %s", exc)
            raise
        return response.json()


def _format_amount(amount_rub: int) -> str:
    return f"{amount_rub:.2f}"


def _normalize_metadata(metadata: Dict[str, Any]) -> Dict[str, str]:
    return {str(key): "" if value is None else str(value) for key, value in metadata.items()}


def _safe_response_text(response: httpx.Response) -> str:
    text = (response.text or "").strip()
    return text[:2000]
