from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

import httpx

from .config import Config
from .db import Database


@dataclass
class Lead:
    lead_id: int
    category_id: int
    text: str
    contact: Optional[str]
    source: Optional[str]
    created_at: str

    @classmethod
    def from_mapping(cls, item: dict[str, Any]) -> "Lead":
        lead_id = item.get("lead_id", item.get("id"))
        category_id = item.get("category_id")
        if lead_id is None or category_id is None:
            raise ValueError("lead_id and category_id are required")
        return cls(
            lead_id=int(lead_id),
            category_id=int(category_id),
            text=item.get("text") or item.get("message") or "",
            contact=item.get("contact"),
            source=item.get("source"),
            created_at=item.get("created_at") or item.get("createdAt") or "",
        )

    @classmethod
    def from_row(cls, row: Any) -> "Lead":
        return cls(
            lead_id=int(row["lead_id"]),
            category_id=int(row["category_id"]),
            text=row["text"],
            contact=row["contact"],
            source=row["source"],
            created_at=row["created_at"],
        )

    def to_record(self) -> dict[str, Any]:
        return {
            "lead_id": self.lead_id,
            "category_id": self.category_id,
            "text": self.text,
            "contact": self.contact,
            "source": self.source,
            "created_at": self.created_at,
        }


class LeadService:
    def __init__(self, db: Database, config: Config) -> None:
        self.db = db
        self.api_base = config.leads_api_base
        self.api_token = config.leads_api_token
        self.client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        if self.api_base and self.client is None:
            headers = {}
            if self.api_token:
                headers["Authorization"] = f"Bearer {self.api_token}"
            self.client = httpx.AsyncClient(base_url=self.api_base, headers=headers, timeout=30)

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.client = None

    async def get_latest(self, category_id: int, limit: int) -> list[Lead]:
        if self.api_base:
            leads = await self._fetch_latest(category_id, limit)
            await self.db.store_leads([lead.to_record() for lead in leads])
            return leads
        rows = await self.db.get_latest_leads(category_id, limit)
        return [Lead.from_row(row) for row in rows]

    async def get_new(self, category_id: int, after_id: int, limit: Optional[int] = None) -> list[Lead]:
        if self.api_base:
            leads = await self._fetch_new(category_id, after_id)
            if limit is not None:
                leads = leads[:limit]
            await self.db.store_leads([lead.to_record() for lead in leads])
            return leads
        rows = await self.db.get_leads_after(category_id, after_id)
        leads = [Lead.from_row(row) for row in rows]
        if limit is not None:
            return leads[:limit]
        return leads

    async def get_by_id(self, lead_id: int) -> Optional[Lead]:
        row = await self.db.get_lead_by_id(lead_id)
        return Lead.from_row(row) if row else None

    async def _fetch_latest(self, category_id: int, limit: int) -> list[Lead]:
        await self.start()
        assert self.client
        response = await self.client.get("/leads/latest", params={"category_id": category_id, "limit": limit})
        response.raise_for_status()
        data = response.json()
        return self._parse_payload(data)

    async def _fetch_new(self, category_id: int, after_id: int) -> list[Lead]:
        await self.start()
        assert self.client
        response = await self.client.get("/leads/new", params={"category_id": category_id, "after_id": after_id})
        response.raise_for_status()
        data = response.json()
        return self._parse_payload(data)

    def _parse_payload(self, data: Any) -> list[Lead]:
        if isinstance(data, dict):
            items = data.get("items") or data.get("data") or []
        else:
            items = data
        leads: list[Lead] = []
        for item in items:
            try:
                leads.append(Lead.from_mapping(item))
            except Exception:
                continue
        return leads
