from __future__ import annotations

import os
import time
import uuid
from functools import wraps
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

from storage import (
    DEFAULT_CONFIG,
    NotFoundError,
    SoldOutError,
    create_storage,
    export_confirmed_payments_csv,
)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional during first install
    load_dotenv = None


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
CSV_FILE = BASE_DIR / "confirmed_payments.csv"

if load_dotenv:
    load_dotenv(BASE_DIR.parent / ".env")
    load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)

storage = create_storage(BASE_DIR)
storage.ensure_seed_data()
export_confirmed_payments_csv(storage.list_tokens(), CSV_FILE)

ADMIN_USER = os.getenv("ADMIN_USER", "Ramakrishna")
ADMIN_PASS = os.getenv("ADMIN_PASS", "AMXPG_234")
ACTIVE_ADMIN_TOKENS: set[str] = set()


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            abort(401, description="Missing or invalid Authorization header")

        token = auth_header.split("Bearer ", 1)[1]
        if token not in ACTIVE_ADMIN_TOKENS:
            abort(401, description="Invalid or expired admin token")

        return view_func(*args, **kwargs)

    return wrapped


@app.before_request
def before_request() -> None:
    config = storage.get_config()
    lock_duration = int(config.get("lockDurationSeconds") or DEFAULT_CONFIG["lockDurationSeconds"])
    storage.release_expired_tokens(lock_duration)


@app.route("/api/events", methods=["GET"])
def get_events():
    return jsonify(storage.list_events())


@app.route("/api/events/<int:event_id>", methods=["GET"])
def get_event(event_id: int):
    event = storage.get_event(event_id)
    if event is None:
        abort(404, description="Event not found")
    return jsonify(event)


@app.route("/api/book", methods=["POST"])
def book_event():
    payload = request.get_json(silent=True) or {}
    if "event_id" not in payload:
        abort(400, description="Missing event_id in request body")

    try:
        event = storage.book_event(int(payload["event_id"]))
    except NotFoundError as exc:
        abort(404, description=str(exc))
    except SoldOutError as exc:
        return jsonify({"error": str(exc)}), 400

    return (
        jsonify(
            {
                "message": f"Successfully booked for '{event['title']}'",
                "user": payload.get("user_name", "Anonymous"),
                "event_id": event["id"],
                "remaining_slots": event["capacity"] - event["booked"],
            }
        ),
        201,
    )


@app.route("/api/admin-login", methods=["POST"])
def admin_login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")

    if not username or not password:
        abort(400, description="Missing credentials")

    if username != ADMIN_USER or password != ADMIN_PASS:
        abort(401, description="Invalid credentials")

    token = str(uuid.uuid4())
    ACTIVE_ADMIN_TOKENS.add(token)
    return jsonify({"token": token, "message": "Login successful"})


@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify(storage.get_config())


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "time": time.time(), "storage": storage.backend_name})


@app.route("/api/debug/storage-summary", methods=["GET"])
def debug_storage_summary():
    return jsonify(storage.get_debug_summary())


@app.route("/api/seats-count", methods=["GET"])
def seats_count():
    tokens = storage.list_tokens()
    available = sum(1 for token in tokens if token.get("status") == "available")
    return jsonify({"available_seats": available, "total_seats": len(tokens)})


@app.route("/api/lock-token", methods=["POST"])
def lock_token():
    payload = request.get_json(silent=True) or {}
    if "user_id" not in payload:
        abort(400, description="Missing user_id in request body")

    try:
        token = storage.lock_next_token(payload)
    except SoldOutError:
        return "Sold Out", 400

    return jsonify({"token_id": token["token_id"]})


@app.route("/api/submit-payment", methods=["POST"])
def submit_payment():
    payload = request.get_json(silent=True) or {}
    token_id = payload.get("token_id")
    utr = payload.get("utr")
    if not token_id or not utr:
        abort(400, description="Missing token_id or utr in request body")

    try:
        storage.submit_payment(token_id, utr)
    except NotFoundError as exc:
        abort(404, description=str(exc))

    return "Payment submitted, pending verification", 200


@app.route("/api/confirm-payment", methods=["POST"])
@admin_required
def confirm_payment():
    payload = request.get_json(silent=True) or {}
    token_id = payload.get("token_id")
    if not token_id:
        abort(400, description="Missing token_id in request body")

    try:
        storage.confirm_payment(token_id)
    except NotFoundError as exc:
        abort(404, description=str(exc))

    export_confirmed_payments_csv(storage.list_tokens(), CSV_FILE)

    return jsonify(
        {
            "message": "Payment confirmed and saved to CSV",
            "token_id": token_id,
            "status": "confirmed",
        }
    )


@app.route("/api/reject-payment", methods=["POST"])
@admin_required
def reject_payment():
    payload = request.get_json(silent=True) or {}
    token_id = payload.get("token_id")
    if not token_id:
        abort(400, description="Missing token_id in request body")

    try:
        storage.reject_payment(token_id)
    except NotFoundError as exc:
        abort(404, description=str(exc))

    export_confirmed_payments_csv(storage.list_tokens(), CSV_FILE)

    return jsonify({"message": "Payment rejected", "token_id": token_id, "status": "available"})


@app.route("/api/get-all-tokens", methods=["GET"])
@admin_required
def get_all_tokens():
    return jsonify(storage.list_tokens())


@app.errorhandler(400)
def bad_request(error):
    return jsonify({"error": str(error.description)}), 400


@app.errorhandler(401)
def unauthorized(error):
    return jsonify({"error": str(error.description)}), 401


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": str(error.description)}), 404


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    if path.startswith("api"):
        abort(404)

    asset_path = FRONTEND_DIST_DIR / path
    if path and asset_path.exists():
        return send_from_directory(str(FRONTEND_DIST_DIR), path)

    index_path = FRONTEND_DIST_DIR / "index.html"
    if index_path.exists():
        return send_from_directory(str(FRONTEND_DIST_DIR), "index.html")

    return "Backend is running. Build the frontend to see the interface."


if __name__ == "__main__":
    print(f"Event Booking System Backend is running with {storage.backend_name} storage...")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
