from __future__ import annotations

import csv
import json
import os
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any


DEFAULT_CONFIG = {
    "eventName": "IV ECE 2026 BLR",
    "ticketPrice": 3000,
    "upiId": "mukeshreddy200593@oksbi",
    "payeeName": "Event Organizer",
    "lockDurationSeconds": 300,
}

DEFAULT_TOKEN_COUNT = 43
TOKEN_ID_PREFIX = "EVENT"
TOKEN_FIELDS = {
    "token_id": None,
    "status": "available",
    "locked_by": None,
    "lock_time": None,
    "utr": None,
    "user_name": None,
    "user_roll": None,
    "user_gender": None,
    "user_age": None,
    "user_phone": None,
    "user_section": None,
}


class StorageError(Exception):
    pass


class SoldOutError(StorageError):
    pass


class NotFoundError(StorageError):
    pass


def token_id_for(index: int) -> str:
    return f"{TOKEN_ID_PREFIX}-{index:03d}"


def build_default_tokens(count: int = DEFAULT_TOKEN_COUNT) -> list[dict[str, Any]]:
    return [normalize_token({"token_id": token_id_for(index)}) for index in range(1, count + 1)]


def normalize_token(token: dict[str, Any] | None) -> dict[str, Any]:
    normalized = deepcopy(TOKEN_FIELDS)
    if token:
        normalized.update(token)
    if not normalized["token_id"]:
        normalized["token_id"] = token_id_for(1)
    return normalized


def reset_token(token: dict[str, Any]) -> dict[str, Any]:
    cleaned = normalize_token(token)
    cleaned.update(
        {
            "status": "available",
            "locked_by": None,
            "lock_time": None,
            "utr": None,
            "user_name": None,
            "user_roll": None,
            "user_gender": None,
            "user_age": None,
            "user_phone": None,
            "user_section": None,
        }
    )
    return cleaned


def confirmed_payment_row(token: dict[str, Any]) -> list[str]:
    payment_time = "N/A"
    lock_time = token.get("lock_time")
    if isinstance(lock_time, (int, float)):
        payment_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(lock_time))

    return [
        token.get("token_id", ""),
        token.get("user_name", ""),
        token.get("user_roll", ""),
        token.get("user_phone", ""),
        token.get("user_section", ""),
        payment_time,
        token.get("utr", ""),
    ]


def export_confirmed_payments_csv(tokens: list[dict[str, Any]], csv_path: str | Path) -> None:
    path = Path(csv_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    confirmed_tokens = sorted(
        (normalize_token(token) for token in tokens if token.get("status") == "confirmed"),
        key=lambda token: token["token_id"],
    )

    with path.open("w", newline="", encoding="utf-8") as file_obj:
        writer = csv.writer(file_obj)
        writer.writerow(
            [
                "Token Number",
                "Name",
                "Roll Number",
                "Phone Number",
                "Section",
                "Time of Payment",
                "UTR Number",
            ]
        )
        for token in confirmed_tokens:
            writer.writerow(confirmed_payment_row(token))


def export_confirmed_payments_excel(tokens: list[dict[str, Any]], xlsx_path: str | Path) -> None:
    """Write all confirmed tokens to an Excel workbook (same columns as the CSV export)."""
    from openpyxl import Workbook

    path = Path(xlsx_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    confirmed_tokens = sorted(
        (normalize_token(token) for token in tokens if token.get("status") == "confirmed"),
        key=lambda token: token["token_id"],
    )

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Confirmed payments"
    sheet.append(
        [
            "Token Number",
            "Name",
            "Roll Number",
            "Phone Number",
            "Section",
            "Time of Payment",
            "UTR Number",
        ]
    )
    for token in confirmed_tokens:
        sheet.append(confirmed_payment_row(token))

    workbook.save(path)


class BaseStorage:
    backend_name = "base"

    def ensure_seed_data(self) -> None:
        raise NotImplementedError

    def get_config(self) -> dict[str, Any]:
        raise NotImplementedError

    def list_events(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_event(self, event_id: int) -> dict[str, Any] | None:
        raise NotImplementedError

    def book_event(self, event_id: int) -> dict[str, Any]:
        raise NotImplementedError

    def list_tokens(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def release_expired_tokens(self, lock_duration_seconds: int) -> int:
        raise NotImplementedError

    def lock_next_token(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def submit_payment(self, token_id: str, utr: str) -> dict[str, Any]:
        raise NotImplementedError

    def confirm_payment(self, token_id: str) -> dict[str, Any]:
        raise NotImplementedError

    def reject_payment(self, token_id: str) -> dict[str, Any]:
        raise NotImplementedError

    def get_debug_summary(self) -> dict[str, Any]:
        raise NotImplementedError


class LocalStorage(BaseStorage):
    backend_name = "local"

    def __init__(self, base_dir: str | Path):
        self.base_dir = Path(base_dir)
        self.events_path = self.base_dir / "events.json"
        self.tokens_path = self.base_dir / "tokens.json"
        self.config_path = self.base_dir / "config.json"
        self._lock = threading.RLock()

    def ensure_seed_data(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

        config = self._read_json(self.config_path, None)
        if config is None:
            self._write_json(self.config_path, DEFAULT_CONFIG)

        # tokens.json is the live database for the local backend: keep it committed in git
        # (do not gitignore it) so confirmed payments survive clone/pull/deploy on a new disk.
        tokens = self._read_json(self.tokens_path, None)
        if tokens is None:
            self._write_json(self.tokens_path, build_default_tokens())
        else:
            normalized_tokens = [normalize_token(token) for token in tokens]
            if normalized_tokens != tokens:
                self._write_json(self.tokens_path, normalized_tokens)

        if self._read_json(self.events_path, None) is None:
            self._write_json(self.events_path, [])

    def get_config(self) -> dict[str, Any]:
        return self._read_json(self.config_path, DEFAULT_CONFIG.copy())

    def list_events(self) -> list[dict[str, Any]]:
        return self._read_json(self.events_path, [])

    def get_event(self, event_id: int) -> dict[str, Any] | None:
        events = self.list_events()
        return next((event for event in events if event.get("id") == event_id), None)

    def book_event(self, event_id: int) -> dict[str, Any]:
        with self._lock:
            events = self.list_events()
            event = next((item for item in events if item.get("id") == event_id), None)
            if event is None:
                raise NotFoundError("Event not found")
            if event.get("booked", 0) >= event.get("capacity", 0):
                raise SoldOutError("Event is fully booked")
            event["booked"] = event.get("booked", 0) + 1
            self._write_json(self.events_path, events)
            return event

    def list_tokens(self) -> list[dict[str, Any]]:
        tokens = self._read_json(self.tokens_path, [])
        return [normalize_token(token) for token in tokens]

    def release_expired_tokens(self, lock_duration_seconds: int) -> int:
        with self._lock:
            tokens = self.list_tokens()
            current_time = time.time()
            changed = 0

            for index, token in enumerate(tokens):
                if token.get("status") != "locked":
                    continue
                
                utr = token.get("utr")
                # A token should only be kept locked if it has a non-empty UTR
                has_utr = utr and str(utr).strip()
                
                if has_utr:
                    continue
                    
                lock_time = token.get("lock_time")
                if not isinstance(lock_time, (int, float)):
                    # If lock_time is missing or invalid, reset it to be safe
                    tokens[index] = reset_token(token)
                    changed += 1
                    continue

                if current_time - lock_time > lock_duration_seconds:
                    print(f"DEBUG: Releasing expired token {token.get('token_id')} (expired by {int(current_time - lock_time - lock_duration_seconds)}s)")
                    tokens[index] = reset_token(token)
                    changed += 1

            if changed:
                self._write_json(self.tokens_path, tokens)

            return changed

    def lock_next_token(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            tokens = self.list_tokens()
            token = next((item for item in tokens if item.get("status") == "available"), None)
            if token is None:
                raise SoldOutError("Sold Out")

            token.update(
                {
                    "status": "locked",
                    "locked_by": payload.get("user_id"),
                    "lock_time": time.time(),
                    "user_name": payload.get("user_name"),
                    "user_roll": payload.get("user_roll"),
                    "user_gender": payload.get("user_gender"),
                    "user_age": payload.get("user_age"),
                    "user_phone": payload.get("user_phone"),
                    "user_section": payload.get("user_section"),
                }
            )

            self._write_json(self.tokens_path, tokens)
            return normalize_token(token)

    def submit_payment(self, token_id: str, utr: str) -> dict[str, Any]:
        with self._lock:
            tokens = self.list_tokens()
            token = next((item for item in tokens if item.get("token_id") == token_id), None)
            if token is None:
                raise NotFoundError("Token not found")

            token["utr"] = utr
            # Mark as pending so it stays in admin queue until manual action.
            token["status"] = "pending"
            self._write_json(self.tokens_path, tokens)
            return normalize_token(token)

    def confirm_payment(self, token_id: str) -> dict[str, Any]:
        with self._lock:
            tokens = self.list_tokens()
            token = next((item for item in tokens if item.get("token_id") == token_id), None)
            if token is None:
                raise NotFoundError("Token not found")

            token["status"] = "confirmed"
            self._write_json(self.tokens_path, tokens)
            return normalize_token(token)

    def reject_payment(self, token_id: str) -> dict[str, Any]:
        with self._lock:
            tokens = self.list_tokens()
            token = next((item for item in tokens if item.get("token_id") == token_id), None)
            if token is None:
                raise NotFoundError("Token not found")

            reset = reset_token(token)
            token.update(reset)
            self._write_json(self.tokens_path, tokens)
            return normalize_token(token)

    def get_debug_summary(self) -> dict[str, Any]:
        tokens = self.list_tokens()
        events = self.list_events()
        return {
            "storage": self.backend_name,
            "collections": ["config", "events", "tokens"],
            "config_docs": 1 if self.get_config() else 0,
            "events_count": len(events),
            "tokens_count": len(tokens),
            "token_status_counts": {
                "available": sum(1 for token in tokens if token.get("status") == "available"),
                "locked": sum(1 for token in tokens if token.get("status") == "locked"),
                "pending": sum(1 for token in tokens if token.get("status") == "pending"),
                "confirmed": sum(1 for token in tokens if token.get("status") == "confirmed"),
            },
        }

    def _read_json(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default

        with path.open("r", encoding="utf-8") as file_obj:
            try:
                return json.load(file_obj)
            except json.JSONDecodeError:
                return default

    def _write_json(self, path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as file_obj:
            json.dump(data, file_obj, indent=4)


class FirestoreStorage(BaseStorage):
    backend_name = "firestore"

    def __init__(self, base_dir: str | Path):
        self.base_dir = Path(base_dir)
        self.seed_storage = LocalStorage(base_dir)

        import firebase_admin
        from firebase_admin import credentials, firestore

        self.firestore = firestore
        app_name = os.getenv("FIREBASE_APP_NAME", "payments-app")

        try:
            firebase_app = firebase_admin.get_app(app_name)
        except ValueError:
            firebase_app = firebase_admin.initialize_app(
                self._load_credentials(credentials),
                {"projectId": os.getenv("FIREBASE_PROJECT_ID")} if os.getenv("FIREBASE_PROJECT_ID") else None,
                name=app_name,
            )

        self.db = firestore.client(firebase_app)
        self.namespace = os.getenv("FIREBASE_NAMESPACE", "event-booking")
        self.root_doc = self.db.collection("apps").document(self.namespace)
        self.config_doc = self.root_doc.collection("config").document("default")
        self.events_collection = self.root_doc.collection("events")
        self.tokens_collection = self.root_doc.collection("tokens")
        # Mirror token records into a top-level collection so they are easy to inspect in Firebase UI.
        self.registrations_collection = self.db.collection("registrations")

    def ensure_seed_data(self) -> None:
        self.seed_storage.ensure_seed_data()
        self.root_doc.set({"namespace": self.root_doc.id}, merge=True)

        seed_config = self.seed_storage.get_config()
        config_snapshot = self.config_doc.get()
        if not config_snapshot.exists:
            self.config_doc.set(seed_config)
        else:
            current_config = config_snapshot.to_dict() or {}
            merged_config = {**current_config, **seed_config}
            if merged_config != current_config:
                # Keep Firestore config aligned with local config.json values on startup.
                self.config_doc.set(merged_config)

        if not self._has_documents(self.tokens_collection):
            tokens = self.seed_storage.list_tokens() or build_default_tokens()
            batch = self.db.batch()
            for token in tokens:
                batch.set(self.tokens_collection.document(token["token_id"]), normalize_token(token))
                batch.set(
                    self.registrations_collection.document(self._registration_doc_id(token["token_id"])),
                    self._registration_payload(token),
                )
            batch.commit()
        else:
            self._sync_registrations_mirror()

        if not self._has_documents(self.events_collection):
            events = self.seed_storage.list_events()
            if events:
                batch = self.db.batch()
                for event in events:
                    batch.set(self.events_collection.document(str(event["id"])), event)
                batch.commit()

    def get_config(self) -> dict[str, Any]:
        snapshot = self.config_doc.get()
        if not snapshot.exists:
            config = DEFAULT_CONFIG.copy()
            self.config_doc.set(config)
            return config
        return snapshot.to_dict() or DEFAULT_CONFIG.copy()

    def list_events(self) -> list[dict[str, Any]]:
        return [doc.to_dict() for doc in self.events_collection.order_by("id").stream()]

    def get_event(self, event_id: int) -> dict[str, Any] | None:
        snapshot = self.events_collection.document(str(event_id)).get()
        return snapshot.to_dict() if snapshot.exists else None

    def book_event(self, event_id: int) -> dict[str, Any]:
        transaction = self.db.transaction()
        event_ref = self.events_collection.document(str(event_id))

        @self.firestore.transactional
        def transaction_body(txn):
            snapshot = event_ref.get(transaction=txn)
            if not snapshot.exists:
                raise NotFoundError("Event not found")

            event = snapshot.to_dict() or {}
            if event.get("booked", 0) >= event.get("capacity", 0):
                raise SoldOutError("Event is fully booked")

            event["booked"] = event.get("booked", 0) + 1
            txn.set(event_ref, event)
            return event

        return transaction_body(transaction)

    def list_tokens(self) -> list[dict[str, Any]]:
        return [normalize_token(doc.to_dict()) for doc in self.tokens_collection.order_by("token_id").stream()]

    def release_expired_tokens(self, lock_duration_seconds: int) -> int:
        current_time = time.time()
        batch = self.db.batch()
        changed = 0

        for doc in self.tokens_collection.where("status", "==", "locked").stream():
            token = normalize_token(doc.to_dict())
            
            utr = token.get("utr")
            has_utr = utr and str(utr).strip()
            
            if has_utr:
                continue
                
            lock_time = token.get("lock_time")
            is_expired = False
            
            if not isinstance(lock_time, (int, float)):
                is_expired = True
            elif current_time - lock_time > lock_duration_seconds:
                is_expired = True
                print(f"DEBUG: Firestore Releasing expired token {token.get('token_id')}")

            if is_expired:
                reset = reset_token(token)
                batch.set(doc.reference, reset)
                batch.set(
                    self.registrations_collection.document(self._registration_doc_id(reset["token_id"])),
                    self._registration_payload(reset),
                )
                changed += 1

        if changed:
            batch.commit()

        return changed

    def lock_next_token(self, payload: dict[str, Any]) -> dict[str, Any]:
        transaction = self.db.transaction()

        @self.firestore.transactional
        def transaction_body(txn):
            query = self.tokens_collection.order_by("token_id")
            snapshots = list(txn.get(query))
            snapshot = next(
                (candidate for candidate in snapshots if (candidate.to_dict() or {}).get("status") == "available"),
                None,
            )
            if snapshot is None:
                raise SoldOutError("Sold Out")

            token = normalize_token(snapshot.to_dict())
            token.update(
                {
                    "status": "locked",
                    "locked_by": payload.get("user_id"),
                    "lock_time": time.time(),
                    "user_name": payload.get("user_name"),
                    "user_roll": payload.get("user_roll"),
                    "user_gender": payload.get("user_gender"),
                    "user_age": payload.get("user_age"),
                    "user_phone": payload.get("user_phone"),
                    "user_section": payload.get("user_section"),
                }
            )
            txn.set(snapshot.reference, token)
            txn.set(
                self.registrations_collection.document(self._registration_doc_id(token["token_id"])),
                self._registration_payload(token),
            )
            return token

        return transaction_body(transaction)

    def submit_payment(self, token_id: str, utr: str) -> dict[str, Any]:
        token_ref = self.tokens_collection.document(token_id)
        snapshot = token_ref.get()
        if not snapshot.exists:
            raise NotFoundError("Token not found")

        token = normalize_token(snapshot.to_dict())
        token["utr"] = utr
        # Mark as pending so it stays in admin queue until manual action.
        token["status"] = "pending"
        token_ref.set(token)
        self.registrations_collection.document(self._registration_doc_id(token["token_id"])).set(
            self._registration_payload(token)
        )
        return token

    def confirm_payment(self, token_id: str) -> dict[str, Any]:
        token_ref = self.tokens_collection.document(token_id)
        snapshot = token_ref.get()
        if not snapshot.exists:
            raise NotFoundError("Token not found")

        token = normalize_token(snapshot.to_dict())
        token["status"] = "confirmed"
        token_ref.set(token)
        self.registrations_collection.document(self._registration_doc_id(token["token_id"])).set(
            self._registration_payload(token)
        )
        return token

    def reject_payment(self, token_id: str) -> dict[str, Any]:
        token_ref = self.tokens_collection.document(token_id)
        snapshot = token_ref.get()
        if not snapshot.exists:
            raise NotFoundError("Token not found")

        token = reset_token(snapshot.to_dict() or {"token_id": token_id})
        token_ref.set(token)
        self.registrations_collection.document(self._registration_doc_id(token["token_id"])).set(
            self._registration_payload(token)
        )
        return token

    def get_debug_summary(self) -> dict[str, Any]:
        tokens = self.list_tokens()
        root_collections = sorted(collection.id for collection in self.root_doc.collections())
        return {
            "storage": self.backend_name,
            "collections": root_collections,
            "config_docs": sum(1 for _ in self.config_doc.parent.stream()),
            "events_count": sum(1 for _ in self.events_collection.stream()),
            "registrations_count": sum(1 for _ in self.registrations_collection.where("namespace", "==", self.namespace).stream()),
            "tokens_count": len(tokens),
            "token_status_counts": {
                "available": sum(1 for token in tokens if token.get("status") == "available"),
                "locked": sum(1 for token in tokens if token.get("status") == "locked"),
                "pending": sum(1 for token in tokens if token.get("status") == "pending"),
                "confirmed": sum(1 for token in tokens if token.get("status") == "confirmed"),
            },
        }

    def _has_documents(self, collection_ref) -> bool:
        return any(True for _ in collection_ref.limit(1).stream())

    def _registration_doc_id(self, token_id: str) -> str:
        return f"{self.namespace}_{token_id}"

    def _registration_payload(self, token: dict[str, Any]) -> dict[str, Any]:
        normalized = normalize_token(token)
        normalized.update(
            {
                "namespace": self.namespace,
                "token_doc_path": f"apps/{self.namespace}/tokens/{normalized['token_id']}",
            }
        )
        return normalized

    def _sync_registrations_mirror(self) -> None:
        batch = self.db.batch()
        for token in self.list_tokens():
            batch.set(
                self.registrations_collection.document(self._registration_doc_id(token["token_id"])),
                self._registration_payload(token),
            )
        batch.commit()

    def _load_credentials(self, credentials):
        raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if raw_json:
            service_account = json.loads(raw_json)
            if "private_key" in service_account:
                service_account["private_key"] = service_account["private_key"].replace("\\n", "\n")
            return credentials.Certificate(service_account)

        path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if path:
            return credentials.Certificate(path)

        return credentials.ApplicationDefault()


def create_storage(base_dir: str | Path) -> BaseStorage:
    backend = os.getenv("PAYMENTS_STORAGE_BACKEND", "local").strip().lower()
    if backend == "local":
        return LocalStorage(base_dir)
    if backend == "firestore":
        return FirestoreStorage(base_dir)
    raise ValueError(f"Unsupported PAYMENTS_STORAGE_BACKEND: {backend}")
