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

from prompts import CLARIFICATION_SYSTEM, GENERATION_SYSTEM

load_dotenv()

app = FastAPI(title="Character Card Builder")
app.mount("/static", StaticFiles(directory="static"), name="static")

sessions: Dict[str, dict] = {}

NANO_GPT_BASE_URL = os.getenv("NANO_GPT_BASE_URL", "https://api.nano-gpt.com/v1")
DEFAULT_API_KEY = os.getenv("NANO_GPT_API_KEY", "")
MODEL = os.getenv("NANO_GPT_MODEL", "xiaomi/mimo-v2.5-pro:thinking")


# ── Request models ────────────────────────────────────────────────────────────

class StartRequest(BaseModel):
    card_type: str          # "single" | "group" | "scenario"
    api_key: Optional[str] = None

class ChatRequest(BaseModel):
    session_id: str
    message: str
    api_key: Optional[str] = None

class GenerateRequest(BaseModel):
    session_id: str
    api_key: Optional[str] = None

class RegenerateRequest(BaseModel):
    session_id: str
    feedback: Optional[str] = None
    api_key: Optional[str] = None


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
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not extract valid JSON from model response. Raw output:\n{text[:500]}")


async def call_api(
    messages: list,
    system: str,
    api_key: str,
    temperature: float = 0.8,
    max_tokens: int = 6000,
) -> str:
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"{NANO_GPT_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"Nano-GPT API error: {resp.text}")

    data = resp.json()
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
    return {"has_server_key": bool(DEFAULT_API_KEY), "model": MODEL}


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
        max_tokens=800,
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

    response = await call_api(
        messages=session["messages"],
        system=CLARIFICATION_SYSTEM[session["card_type"]],
        api_key=api_key,
        temperature=0.85,
        max_tokens=1000,
    )

    session["messages"].append({"role": "assistant", "content": response})
    return {"message": response}


@app.post("/api/generate")
async def generate_card(req: GenerateRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    api_key = resolve_api_key(req.api_key)
    session = sessions[req.session_id]

    if len(session["messages"]) < 2:
        raise HTTPException(400, "Please have a conversation first so the AI has enough details.")

    # Summarise the full conversation as user context for the generator
    convo_text = "\n\n".join(
        f"{'USER' if m['role'] == 'user' else 'ASSISTANT'}: {m['content']}"
        for m in session["messages"]
    )
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
        max_tokens=8000,
    )

    card = extract_json(raw)

    # Stamp metadata
    card["create_date"] = datetime.now().isoformat() + "Z"
    card["fav"] = False
    if "data" in card:
        card["name"] = card["data"].get("name", "Character")
        card["description"] = card["data"].get("description", "")
        card["personality"] = card["data"].get("personality", "")
        card["scenario"] = card["data"].get("scenario", "")
        card["first_mes"] = card["data"].get("first_mes", "")
        card["mes_example"] = card["data"].get("mes_example", "")
        card["creatorcomment"] = card["data"].get("creator_notes", "")
        card["tags"] = card["data"].get("tags", [])
        card["creator"] = card["data"].get("creator", "CharacterCardBuilder")
        card["character_version"] = card["data"].get("character_version", "")
        card["avatar"] = "none"
        card["talkativeness"] = "0.5"

    session["generated_card"] = card
    return {"card": card}


@app.post("/api/regenerate")
async def regenerate_card(req: RegenerateRequest):
    if req.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    api_key = resolve_api_key(req.api_key)
    session = sessions[req.session_id]

    convo_text = "\n\n".join(
        f"{'USER' if m['role'] == 'user' else 'ASSISTANT'}: {m['content']}"
        for m in session["messages"]
    )

    feedback_block = ""
    if req.feedback:
        feedback_block = f"\n\nADDITIONAL USER FEEDBACK FOR THIS REGENERATION:\n{req.feedback}"

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
        max_tokens=8000,
    )

    card = extract_json(raw)
    card["create_date"] = datetime.now().isoformat() + "Z"
    card["fav"] = False
    if "data" in card:
        card["name"] = card["data"].get("name", "Character")
        card["description"] = card["data"].get("description", "")
        card["personality"] = card["data"].get("personality", "")
        card["scenario"] = card["data"].get("scenario", "")
        card["first_mes"] = card["data"].get("first_mes", "")
        card["mes_example"] = card["data"].get("mes_example", "")
        card["creatorcomment"] = card["data"].get("creator_notes", "")
        card["tags"] = card["data"].get("tags", [])
        card["creator"] = card["data"].get("creator", "CharacterCardBuilder")
        card["character_version"] = card["data"].get("character_version", "")
        card["avatar"] = "none"
        card["talkativeness"] = "0.5"

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
