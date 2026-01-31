#!/usr/bin/env python3
"""
ASR Service for Mouth High
Uses Alibaba Cloud Qwen3-ASR for speech recognition.
Communicates with Tauri via stdin/stdout.
"""

import sys
import json
import os
import base64
import requests

def get_api_key():
    """Get API key from environment variable or config file."""
    # Try environment variable first
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if api_key:
        return api_key

    # Try config file in user's home directory
    config_path = os.path.expanduser("~/.mouth-high/config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
                api_key = config.get("dashscope_api_key")
                if api_key:
                    return api_key
        except Exception as e:
            print(f"Warning: Failed to read config file: {e}", file=sys.stderr, flush=True)

    return None

def transcribe_audio(audio_path: str, api_key: str) -> dict:
    """Transcribe audio using Alibaba Cloud Qwen3-ASR API."""
    # Read and encode audio file as base64
    with open(audio_path, "rb") as f:
        audio_data = f.read()
    audio_base64 = base64.b64encode(audio_data).decode("utf-8")

    # Determine audio format from extension
    ext = os.path.splitext(audio_path)[1].lower()
    if ext == ".wav":
        mime_type = "audio/wav"
    elif ext == ".mp3":
        mime_type = "audio/mp3"
    elif ext == ".m4a":
        mime_type = "audio/m4a"
    else:
        mime_type = "audio/wav"  # Default to wav

    # Create data URI
    audio_uri = f"data:{mime_type};base64,{audio_base64}"

    # Call DashScope API
    url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "qwen3-asr-flash",
        "input": {
            "messages": [
                {"content": [{"text": ""}], "role": "system"},
                {"content": [{"audio": audio_uri}], "role": "user"}
            ]
        },
        "parameters": {
            "asr_options": {
                "enable_itn": True  # Enable Inverse Text Normalization for better formatting
            }
        }
    }

    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()

    result = response.json()

    # Extract text from response
    # Response format: {"output": {"choices": [{"message": {"content": [{"text": "..."}]}}]}}
    if "output" in result and "choices" in result["output"]:
        choices = result["output"]["choices"]
        if choices and "message" in choices[0]:
            content = choices[0]["message"].get("content", [])
            if content and "text" in content[0]:
                return {"text": content[0]["text"], "language": None}

    # Fallback: check for error
    if "code" in result:
        raise Exception(f"API Error: {result.get('code')} - {result.get('message', 'Unknown error')}")

    return {"text": "", "language": None}

def main():
    """Main loop: read audio paths from stdin, output transcriptions to stdout."""
    print("ASR Service starting...", file=sys.stderr, flush=True)

    # Check API key on startup
    api_key = get_api_key()
    if not api_key:
        print("Warning: DASHSCOPE_API_KEY not set. Please set it via environment variable or ~/.mouth-high/config.json", file=sys.stderr, flush=True)
        print(json.dumps({
            "error": "API key not configured. Set DASHSCOPE_API_KEY environment variable or create ~/.mouth-high/config.json with {\"dashscope_api_key\": \"your-key\"}"
        }), flush=True)
        sys.exit(1)

    print("API key configured", file=sys.stderr, flush=True)
    print("ASR Service ready (using Qwen3-ASR)", file=sys.stderr, flush=True)

    for line in sys.stdin:
        audio_path = line.strip()

        if not audio_path:
            continue

        if audio_path == "quit":
            break

        if not os.path.exists(audio_path):
            print(json.dumps({
                "error": f"Audio file not found: {audio_path}"
            }), flush=True)
            continue

        try:
            # Transcribe the audio
            result = transcribe_audio(audio_path, api_key)

            # Output result
            print(json.dumps({
                "text": result.get("text", "").strip(),
                "language": result.get("language")
            }), flush=True)

        except requests.exceptions.Timeout:
            print(json.dumps({
                "error": "API request timed out"
            }), flush=True)
        except requests.exceptions.RequestException as e:
            print(json.dumps({
                "error": f"Network error: {str(e)}"
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                "error": str(e)
            }), flush=True)

    print("ASR Service stopping...", file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()
