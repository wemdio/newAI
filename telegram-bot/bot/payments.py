from __future__ import annotations

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
            payload["metadata"] = metadata
        response = await self._client.post(
            "/payments",
            json=payload,
            headers={"Idempotence-Key": idempotence_key},
        )
        response.raise_for_status()
        return response.json(), idempotence_key

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
            payload["metadata"] = metadata
        response = await self._client.post(
            "/payments",
            json=payload,
            headers={"Idempotence-Key": idempotence_key},
        )
        response.raise_for_status()
        return response.json(), idempotence_key

    async def get_payment(self, payment_id: str) -> Dict[str, Any]:
        if not self.enabled or not self._client:
            raise RuntimeError("Payments are not configured")
        response = await self._client.get(f"/payments/{payment_id}")
        response.raise_for_status()
        return response.json()


def _format_amount(amount_rub: int) -> str:
    return f"{amount_rub:.2f}"
