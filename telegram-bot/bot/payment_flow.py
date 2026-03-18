from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from aiogram import Bot

from .config import Config
from .constants import CATEGORY_BY_ID, Category
from .db import Database
from .formatters import format_lead_text
from .keyboards import lead_actions_keyboard, post_activation_keyboard
from .leads import LeadService
from .payments import PaymentService
from .subscriptions import activate_subscription
from .texts import payment_canceled_text, subscription_activated_text, subscription_renewed_text
from .utils import extract_contact_url, is_contact_hidden, iso_now


PAYMENT_PROVIDER = "yookassa"


def build_payment_description(category: Category, config: Config, kind: str) -> str:
    if kind == "contact":
        return f"Открытие контакта ({category.title})"
    return f"Подписка {category.title} на {config.subscription_duration_days} дней"


async def start_user_payment(
    *,
    db: Database,
    payments: PaymentService,
    config: Config,
    user_id: int,
    category_id: int,
    amount_rub: int,
    kind: str,
    lead_id: Optional[int] = None,
) -> Any:
    category = CATEGORY_BY_ID[category_id]
    description = build_payment_description(category, config, kind)
    metadata = {"user_id": user_id, "category_id": category_id, "kind": kind}
    if lead_id is not None:
        metadata["lead_id"] = lead_id
    response, idempotence_key = await payments.create_payment(
        amount_rub=amount_rub,
        description=description,
        metadata=metadata,
        save_payment_method=True,
    )
    confirmation_url = _get_confirmation_url(response)
    payment_method_id = _get_payment_method_id(response)
    cancellation_reason = _get_cancellation_reason(response)
    await db.create_payment_record(
        user_id=user_id,
        category_id=category_id,
        provider=PAYMENT_PROVIDER,
        payment_id=response["id"],
        status=response["status"],
        amount_rub=amount_rub,
        currency=response.get("amount", {}).get("currency", "RUB"),
        confirmation_url=confirmation_url,
        idempotence_key=idempotence_key,
        kind=kind,
        lead_id=lead_id,
        payment_method_id=payment_method_id,
        cancellation_reason=cancellation_reason,
    )
    return await db.get_payment_record(response["id"])


async def start_recurring_payment(
    *,
    db: Database,
    payments: PaymentService,
    config: Config,
    user_id: int,
    category_id: int,
    amount_rub: int,
    payment_method_id: str,
) -> Any:
    category = CATEGORY_BY_ID[category_id]
    description = build_payment_description(category, config, "renewal")
    metadata = {"user_id": user_id, "category_id": category_id, "kind": "renewal"}
    response, idempotence_key = await payments.create_recurring_payment(
        amount_rub=amount_rub,
        description=description,
        payment_method_id=payment_method_id,
        metadata=metadata,
    )
    cancellation_reason = _get_cancellation_reason(response)
    await db.create_payment_record(
        user_id=user_id,
        category_id=category_id,
        provider=PAYMENT_PROVIDER,
        payment_id=response["id"],
        status=response["status"],
        amount_rub=amount_rub,
        currency=response.get("amount", {}).get("currency", "RUB"),
        confirmation_url=None,
        idempotence_key=idempotence_key,
        kind="renewal",
        lead_id=None,
        payment_method_id=_get_payment_method_id(response),
        cancellation_reason=cancellation_reason,
    )
    return await db.get_payment_record(response["id"])


async def refresh_and_process_payment(
    *,
    db: Database,
    payments: PaymentService,
    config: Config,
    bot: Optional[Bot],
    leads: Optional[LeadService],
    payment_row,
    notify: bool = True,
) -> str:
    response = await payments.get_payment(payment_row["payment_id"])
    return await process_payment_update(
        db=db,
        config=config,
        bot=bot,
        leads=leads,
        payment_row=payment_row,
        payment_response=response,
        notify=notify,
    )


async def process_payment_update(
    *,
    db: Database,
    config: Config,
    bot: Optional[Bot],
    leads: Optional[LeadService],
    payment_row,
    payment_response: Dict[str, Any],
    notify: bool = True,
) -> str:
    status = payment_response.get("status")
    paid = bool(payment_response.get("paid"))
    previous_status = payment_row["status"]
    payment_method = payment_response.get("payment_method") or {}
    payment_method_id = payment_method.get("id")
    payment_method_saved = bool(payment_method.get("saved"))
    cancellation_reason = _get_cancellation_reason(payment_response)

    update_fields: dict[str, object] = {"status": status}
    if payment_method_id:
        update_fields["payment_method_id"] = payment_method_id
    if cancellation_reason:
        update_fields["cancellation_reason"] = cancellation_reason
    if status == "succeeded" and paid and not payment_row["paid_at"]:
        update_fields["paid_at"] = iso_now()
    await db.update_payment_record(payment_row["payment_id"], **update_fields)

    if status == "succeeded" and paid:
        applied = await db.mark_payment_applied(payment_row["payment_id"])
        if applied:
            end_date = await activate_subscription(
                db,
                config,
                user_id=payment_row["user_id"],
                category_id=payment_row["category_id"],
                grant_type="paid",
            )
            if payment_row["kind"] == "renewal":
                await db.update_subscription_billing(
                    payment_row["user_id"],
                    payment_row["category_id"],
                    last_payment_id=payment_row["payment_id"],
                    canceled_at=None,
                )
            else:
                auto_renew = 1 if (payment_method_saved and config.subscription_auto_renew_default) else 0
                await db.update_subscription_billing(
                    payment_row["user_id"],
                    payment_row["category_id"],
                    auto_renew=auto_renew,
                    provider=PAYMENT_PROVIDER,
                    payment_method_id=payment_method_id if payment_method_saved else None,
                    last_payment_id=payment_row["payment_id"],
                    canceled_at=None,
                )
            if notify and bot:
                category = CATEGORY_BY_ID.get(payment_row["category_id"])
                if category:
                    if payment_row["kind"] == "renewal":
                        await bot.send_message(
                            await _resolve_telegram_id(db, payment_row["user_id"]),
                            subscription_renewed_text(category, config.subscription_duration_days),
                            reply_markup=post_activation_keyboard(),
                        )
                    else:
                        await bot.send_message(
                            await _resolve_telegram_id(db, payment_row["user_id"]),
                            subscription_activated_text(category, config.subscription_duration_days),
                            reply_markup=post_activation_keyboard(),
                        )
            await _deliver_contact_if_needed(
                db=db,
                bot=bot,
                leads=leads,
                payment_row=payment_row,
            )
        return "succeeded"

    if status == "canceled":
        if previous_status != "canceled":
            if payment_row["kind"] == "renewal":
                await db.update_subscription_billing(
                    payment_row["user_id"],
                    payment_row["category_id"],
                    auto_renew=0,
                    canceled_at=iso_now(),
                )
            if notify and bot:
                category = CATEGORY_BY_ID.get(payment_row["category_id"])
                if category:
                    await bot.send_message(
                        await _resolve_telegram_id(db, payment_row["user_id"]),
                        payment_canceled_text(category),
                    )
        return "canceled"

    if status in ("pending", "waiting_for_capture"):
        return "pending"

    return "unknown"


async def _deliver_contact_if_needed(
    *,
    db: Database,
    bot: Optional[Bot],
    leads: Optional[LeadService],
    payment_row,
) -> None:
    lead_id = payment_row["lead_id"]
    if not lead_id or not bot or not leads:
        return
    delivered = await db.mark_payment_lead_delivered(payment_row["payment_id"])
    if not delivered:
        return
    category = CATEGORY_BY_ID.get(payment_row["category_id"])
    if not category:
        return
    lead = await leads.get_by_id(int(lead_id))
    if not lead:
        return
    if lead.contact and is_contact_hidden(lead.contact):
        return
    text = format_lead_text(lead, category, True)
    contact_url = extract_contact_url(lead.contact)
    reply_markup = lead_actions_keyboard(category.id, contact_url)
    try:
        await bot.send_message(await _resolve_telegram_id(db, payment_row["user_id"]), text, reply_markup=reply_markup)
    except Exception as exc:
        logging.warning("Failed to send paid contact for lead %s: %s", lead_id, exc)


def _get_confirmation_url(response: Dict[str, Any]) -> Optional[str]:
    confirmation = response.get("confirmation") or {}
    return confirmation.get("confirmation_url")


def _get_payment_method_id(response: Dict[str, Any]) -> Optional[str]:
    payment_method = response.get("payment_method") or {}
    return payment_method.get("id")


def _get_cancellation_reason(response: Dict[str, Any]) -> Optional[str]:
    details = response.get("cancellation_details") or {}
    return details.get("reason")


async def _resolve_telegram_id(db: Database, user_id: int) -> int:
    user = await db.get_user_by_id(user_id)
    if not user:
        raise RuntimeError("User not found")
    return int(user["telegram_id"])
