import os
import uuid
import json
import re
from datetime import datetime
from typing import Optional, Dict

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

from prompts import (
    CLARIFICATION_SYSTEM,
    GENERATION_SYSTEM,
    EDIT_SYSTEM,
    EDIT_INSTRUCTION,
    OVERHAUL_INSTRUCTION,
)

load_dotenv()

app = FastAPI(title="Character Card Builder")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.middleware("http")
async def no_cache_static(request, call_next):
    """Stop the browser caching app.js / index.html so model/UI fixes apply immediately."""
    response = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


sessions: Dict[str, dict] = {}

NANO_GPT_BASE_URL = os.getenv("NANO_GPT_BASE_URL", "https://api.nano-gpt.com/v1")
DEFAULT_API_KEY = os.getenv("NANO_GPT_API_KEY", "")
DEFAULT_MODEL = os.getenv("NANO_GPT_MODEL", "xiaomi/mimo-v2.5-pro:thinking")
GENERATION_TIMEOUT = float(os.getenv("GENERATION_TIMEOUT", "1200"))  # 20 min default


def get_model() -> str:
    """Read model from env each time so changes don't require a server restart."""
    return os.getenv("NANO_GPT_MODEL", DEFAULT_MODEL)


# ── Request models ────────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    card_type: str          # "single" | "group" | "scenario"
    api_key: Optional[str] = None
    model: Optional[str] = None

class ChatRequest(BaseModel):
    session_id: str
    message: str
    api_key: Optional[str] = None
    model: Optional[str] = None

class GenerateRequest(BaseModel):
    session_id: str
    api_key: Optional[str] = None
    mode: Optional[str] = None  # None | "edit" | "overhaul" (for imported cards)
    model: Optional[str] = None

class RegenerateRequest(BaseModel):
    session_id: str
    feedback: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None

class ImportRequest(BaseModel):
    card_json: str          # raw JSON text the user pasted/uploaded
    api_key: Optional[str] = None
    model: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def resolve_api_key(request_key: Optional[str]) -> str:
    key = request_key or DEFAULT_API_KEY
    if not key:
        raise HTTPException(
            400,
            "No API key provided. Set NANO_GPT_API_KEY in your .env file, "
            "or enter it in the Settings panel."
        )
    return key


def strip_thinking(text: str) -> str:
    """Remove <thinking>…</thinking> blocks that reasoning models prepend."""
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL)
    return text.strip()


def extract_json(text: str) -> dict:
    """Parse JSON from AI output, tolerating markdown fences."""
    text = strip_thinking(text)
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text.strip(), flags=re.MULTILINE)
    text = text.strip()
    print(f"[extract_json] output length after stripping thinking: {len(text)} chars", flush=True)
    try:
        return json.loads(text)
    except json.JSONDecodeError as first_err:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        # Distinguish truncation from other parse errors
        err_str = str(first_err)
        if "Unterminated string" in err_str or "Expecting" in err_str:
            raise ValueError(
                "The model's output was cut off mid-JSON — the card JSON was truncated before "
                f"it could be completed ({len(text):,} chars of output). "
                "This happens when a thinking model uses most of the token budget on internal "
                "reasoning. Try regenerating; if it keeps failing, consider using a less "
                "token-heavy model for generation."
            )
        raise ValueError(f"Could not extract valid JSON from model response. Raw output:\n{text[:500]}")


def convo_to_text(messages: list) -> str:
    """Flatten a message list into a readable transcript for the generator."""
    return "\n\n".join(
        f"{'USER' if m['role'] == 'user' else 'ASSISTANT'}: {m['content']}"
        for m in messages
    )


def finalize_card(card: dict) -> dict:
    """Stamp metadata and mirror v3 `data` fields to the top level SillyTavern reads."""
    card["create_date"] = datetime.now().isoformat() + "Z"
    card["fav"] = False
    if isinstance(card.get("data"), dict):
        d = card["data"]
        card["name"] = d.get("name", "Character")
        card["description"] = d.get("description", "")
        card["personality"] = d.get("personality", "")
        card["scenario"] = d.get("scenario", "")
        card["first_mes"] = d.get("first_mes", "")
        card["mes_example"] = d.get("mes_example", "")
        card["creatorcomment"] = d.get("creator_notes", "")
        card["tags"] = d.get("tags", [])
        card["creator"] = d.get("creator", "CharacterCardBuilder")
        card["character_version"] = d.get("character_version", "")
        card["avatar"] = "none"
        card["talkativeness"] = "0.5"
    return card


def normalize_imported_card(raw: dict) -> dict:
    """Coerce an arbitrary imported card (v2/v3/flat) into our v3 structure."""
    src = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    data = {
        "name": src.get("name", "Imported Character"),
        "description": src.get("description", ""),
        "personality": src.get("personality", ""),
        "scenario": src.get("scenario", ""),
        "first_mes": src.get("first_mes", ""),
        "mes_example": src.get("mes_example", ""),
        "creator_notes": src.get("creator_notes") or raw.get("creatorcomment", "") or "",
        "system_prompt": src.get("system_prompt", ""),
        "post_history_instructions": src.get("post_history_instructions", ""),
        "alternate_greetings": src.get("alternate_greetings", []) or [],
        "tags": src.get("tags", []) or [],
        "creator": src.get("creator", "") or "",
        "character_version": src.get("character_version", "") or "",
        "character_book": src.get("character_book"),
        "extensions": src.get("extensions", {}) or {},
    }
    return {"spec": "chara_card_v3", "spec_version": "3.0", "data": data}


async def call_api(
    messages: list,
    system: str,
    api_key: str,
    temperature: float = 0.8,
    max_tokens: int = 6000,
    timeout: float = 300.0,
    model: Optional[str] = None,
) -> str:
    resolved_model = model or get_model()
    print(f"[call_api] requesting model={resolved_model!r}", flush=True)
    payload = {
        "model": resolved_model,
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=15.0)
        ) as client:
            resp = await client.post(
                f"{NANO_GPT_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException:
        raise HTTPException(
            504,
            f"The model took too long to respond (>{int(timeout)}s). "
            "Try again — thinking models can be slow on large requests. "
            "If it keeps happening, shorten your conversation before generating."
        )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Network error reaching Nano-GPT: {e}")

    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"Nano-GPT API error: {resp.text}")

    data = resp.json()
    print(f"[call_api] response reports model={data.get('model')!r}", flush=True)
    content = data["choices"][0]["message"]["content"]
    return strip_thinking(content)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    with open("static/index.html", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/config")
async def get_config():
    """Tell the frontend whether a server-side API key is configured."""
    return {"has_server_key": bool(DEFAULT_API_KEY), "model": get_model()}


@app.post("/api/start")
async def start_session(req: StartRequest):
    if req.card_type not in CLARIFICATION_SYSTEM:
        raise HTTPException(400, f"Invalid card_type: {req.card_type}")

    api_key = resolve_api_key(req.api_key)

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "card_type": req.card_type,
        "messages": [],
        "created": datetime.now().isoformat(),
        "generated_card": None,
    }

    # Seed the AI with context so it opens naturally
    seed_msg = (
        f"I want to create a {'single character' if req.card_type == 'single' else req.card_type} card."
    )
    initial = await call_api(
        messages=[{"role": "user", "content": seed_msg}],
        system=CLARIFICATION_SYSTEM[req.card_type],
        api_key=api_key,
        temperature=0.85,
        max_tokens=15000,
        model=req.model,
    )

    sessions[session_id]["messages"].append({"role": "assistant", "content": initial})
    return {"session_id": session_id, "message": initial}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    api_key = resolve_api_key(req.api_key)
    session = sessions[req.session_id]

    session["messages"].append({"role": "user", "content": req.message})

    # Edit sessions use the editor assistant and keep the current card in context.
    if session.get("imported_card") is not None:
        card_json = json.dumps(session["generated_card"].get("data", session["generated_card"]),
                               ensure_ascii=False, indent=2)
        system = EDIT_SYSTEM + f"\n\nCURRENT CARD JSON:\n{card_json}"
    else:
        system = CLARIFICATION_SYSTEM[session["card_type"]]

    response = await call_api(
        messages=session["messages"],
        system=system,
        api_key=api_key,
        temperature=0.85,
        max_tokens=15000,
        model=req.model,
    )

    session["messages"].append({"role": "assistant", "content": response})
    return {"message": response}


@app.post("/api/import")
async def import_card(req: ImportRequest):
    """Import an existing character card JSON and open an editing session."""
    api_key = resolve_api_key(req.api_key)

    try:
        raw = json.loads(req.card_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"That doesn't look like valid JSON: {e}")
    if not isinstance(raw, dict):
        raise HTTPException(400, "Expected a JSON object representing a character card.")

    card = finalize_card(normalize_imported_card(raw))

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "card_type": "edit",
        "messages": [],
        "created": datetime.now().isoformat(),
        "imported_card": card,
        "generated_card": card,
    }

    # Ask the editor assistant for an opening assessment of the imported card.
    card_json = json.dumps(card.get("data", card), ensure_ascii=False, indent=2)
    system = EDIT_SYSTEM + f"\n\nCURRENT CARD JSON:\n{card_json}"
    initial = await call_api(
        messages=[{"role": "user", "content":
                   "I've imported this character card. Give me your assessment and ask what I'd like to do."}],
        system=system,
        api_key=api_key,
        temperature=0.7,
        max_tokens=15000,
        model=req.model,
    )

    sessions[session_id]["messages"].append({"role": "assistant", "content": initial})
    return {"session_id": session_id, "message": initial, "card": card}


@app.post("/api/generate")
async def generate_card(req: GenerateRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    api_key = resolve_api_key(req.api_key)
    session = sessions[req.session_id]

    imported = session.get("imported_card")
    convo_text = convo_to_text(session["messages"])

    if imported is not None:
        # Editing/overhauling an imported card.
        card_json = json.dumps(imported.get("data", imported), ensure_ascii=False, indent=2)
        instruction = OVERHAUL_INSTRUCTION if req.mode == "overhaul" else EDIT_INSTRUCTION
        if req.mode != "overhaul" and len(session["messages"]) < 2:
            raise HTTPException(
                400,
                "Tell me what you'd like changed first — or use Overhaul for a full Friction pass."
            )
        convo_block = f"\n\nEDITING CONVERSATION:\n{convo_text}" if convo_text else ""
        gen_prompt = (
            f"{instruction}\n\n"
            f"CURRENT CARD JSON:\n{card_json}{convo_block}\n\n"
            f"Now output the complete revised card as raw JSON."
        )
    else:
        if len(session["messages"]) < 2:
            raise HTTPException(400, "Please have a conversation first so the AI has enough details.")
        gen_prompt = (
            f"Below is the full character design conversation. "
            f"Use everything discussed to generate the complete character card JSON.\n\n"
            f"---\n{convo_text}\n---\n\n"
            f"Now generate the complete character card JSON. Output ONLY the raw JSON object."
        )

    raw = await call_api(
        messages=[{"role": "user", "content": gen_prompt}],
        system=GENERATION_SYSTEM,
        api_key=api_key,
        temperature=0.7,
        max_tokens=100000,
        timeout=GENERATION_TIMEOUT,
        model=req.model,
    )

    try:
        card = finalize_card(extract_json(raw))
    except ValueError as e:
        raise HTTPException(500, str(e))

    # Inject origin tag
    origin_tag = "Friction Rework" if (session.get("imported_card") is not None or req.mode in ("edit", "overhaul")) else "Friction Original"
    if isinstance(card.get("data"), dict):
        tags = card["data"].setdefault("tags", [])
        if not any("Friction" in t for t in tags):
            tags.append(origin_tag)
        card["tags"] = card["data"]["tags"]

    session["generated_card"] = card
    return {"card": card}


@app.post("/api/regenerate")
async def regenerate_card(req: RegenerateRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    api_key = resolve_api_key(req.api_key)
    session = sessions[req.session_id]

    convo_text = convo_to_text(session["messages"])
    feedback_block = ""
    if req.feedback:
        feedback_block = f"\n\nADDITIONAL USER FEEDBACK FOR THIS REGENERATION:\n{req.feedback}"

    imported = session.get("imported_card")
    if imported is not None:
        # Re-run the edit pass on the imported card, honoring extra feedback.
        card_json = json.dumps(imported.get("data", imported), ensure_ascii=False, indent=2)
        convo_block = f"\n\nEDITING CONVERSATION:\n{convo_text}" if convo_text else ""
        gen_prompt = (
            f"{EDIT_INSTRUCTION}\n\n"
            f"CURRENT CARD JSON:\n{card_json}{convo_block}{feedback_block}\n\n"
            f"Now output the complete revised card as raw JSON."
        )
    else:
        gen_prompt = (
            f"Below is the full character design conversation. "
            f"Use everything discussed to generate the complete character card JSON.{feedback_block}\n\n"
            f"---\n{convo_text}\n---\n\n"
            f"Generate the complete character card JSON. Output ONLY the raw JSON object."
        )

    raw = await call_api(
        messages=[{"role": "user", "content": gen_prompt}],
        system=GENERATION_SYSTEM,
        api_key=api_key,
        temperature=0.75,
        max_tokens=100000,
        timeout=GENERATION_TIMEOUT,
        model=req.model,
    )

    try:
        card = finalize_card(extract_json(raw))
    except ValueError as e:
        raise HTTPException(500, str(e))

    # Inject origin tag (regenerate always keeps the session's type)
    origin_tag = "Friction Rework" if session.get("imported_card") is not None else "Friction Original"
    if isinstance(card.get("data"), dict):
        tags = card["data"].setdefault("tags", [])
        if not any("Friction" in t for t in tags):
            tags.append(origin_tag)
        card["tags"] = card["data"]["tags"]

    session["generated_card"] = card
    return {"card": card}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    s = sessions[session_id]
    return {
        "card_type": s["card_type"],
        "message_count": len(s["messages"]),
        "has_card": s["generated_card"] is not None,
    }
