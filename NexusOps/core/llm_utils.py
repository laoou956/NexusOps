"""LLM response helpers shared by Anthropic-compatible providers."""
import os
from typing import Any, Iterable, List, Optional


def extract_text_content(content: Iterable[Any], separator: str = "\n") -> str:
    """Return text blocks from Anthropic-style response content."""
    texts: List[str] = []
    for block in content or []:
        if isinstance(block, str):
            texts.append(block)
            continue

        block_type = getattr(block, "type", None)
        text = getattr(block, "text", None)
        if isinstance(block, dict):
            block_type = block.get("type", block_type)
            text = block.get("text", text)

        if isinstance(text, str) and (block_type in (None, "text")):
            texts.append(text)

    return separator.join(t for t in texts if t)


def anthropic_client_kwargs(api_key: str, base_url: Optional[str] = None) -> dict:
    """构造 AsyncAnthropic 的初始化参数。

    部分 Anthropic 兼容网关（例如阿里云百炼的 claude-code-proxy）只接受
    ``Authorization: Bearer``，而 SDK 在 ``api_key`` 非空时只发送 ``x-api-key``。
    配置 ``ANTHROPIC_AUTH_TOKEN`` 后，这里通过 ``default_headers`` 额外注入 Bearer 头；
    两者同时发送时网关会优先使用 Bearer。
    """
    kwargs: dict = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    token = (os.environ.get("ANTHROPIC_AUTH_TOKEN") or "").strip()
    if token:
        kwargs.setdefault("default_headers", {})["Authorization"] = f"Bearer {token}"
    return kwargs