"""Expose Daybook commands and refresh LeetCode guidance in Discord turns."""

import re


def _message_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text")
    return ""


def _leetcode_context(*, platform="", user_message="", conversation_history=None, **_):
    if platform != "discord":
        return None
    from agent.skill_utils import get_disabled_skill_names

    if "daybook" in get_disabled_skill_names(platform=platform):
        return None
    current = _message_text(user_message)
    recent = [message for message in (conversation_history or []) if message.get("role") in ("user", "assistant")][-6:]
    mentions_leetcode = re.search(r"leetcode|力扣", current, re.IGNORECASE)
    # Follow-up answers often contain only an outcome or a learning note. Use only
    # nearby conversational text; tool output must not activate the workflow.
    continuing = recent and any(re.search(r"leetcode|力扣", _message_text(message.get("content")), re.IGNORECASE) for message in recent) and re.search(
        r"心得|解法|提示|卡住|解出|複習|复习|哪.{0,2}題|which problem|takeaway|approach|solved|hint|stuck|review", _message_text(recent[-1].get("content")), re.IGNORECASE)
    if not mentions_leetcode and not continuing:
        return None
    return {"context": (
        "[Daybook LeetCode workflow refresh for this Discord turn]\n"
        "Read the CURRENT installed daybook skill and references/workflows.md with skill_view; "
        "earlier messages may contain obsolete instructions or incorrect recording examples. "
        "When the user reports practice, collect BOTH the actual outcome and one learning note "
        "for EACH problem before leetcode-attempt. Ask only for missing information and remember "
        "answers across turns. A report such as '今天沒複習 LeetCode，寫了兩題' identifies "
        "attempted problems but supplies neither independent success nor learning notes. Ask "
        "whether each was independently solved, hinted, stuck, or reviewed, and ask for its "
        "approach, difficulty, or takeaway. Never use '使用者回報寫了這題' as a substitute note, "
        "infer solved from '寫了/done' or a checked task, or invent notes from a problem solution. "
        "Once the user supplies both, save with leetcode-attempt and read back to verify. "
        "For a correction to an existing practice, collect all requested problems' outcomes and "
        "notes, then use leetcode-attempt-update on each ORIGINAL attempt ID; never append a "
        "new attempt or count the correction as another review. "
        "Queries and future plans stay read-only; do not record an attempt merely because this "
        "context was added. Respect explicit requests not to save."
    )}

_HELP = """Daybook 快速指令：
/daybook-today：讀取今天的行程、例行公事與待辦。
/daybook-short：列出跨日期的未完成短期待辦，依截止日排序並合併同一項。
/daybook-plan：安排並儲存今天的待辦；可在 args 填入需求。
/daybook-review：複盤今天；填入心得時才會記錄。
/daybook-status：查看完成狀況，args 可填 day、week 或 month。
/daybook：在 args 填入要記錄的行程或其他 Daybook 需求。"""

_COMMANDS = (
    ("daybook", "Daybook：記錄行程或操作行事曆", "[行程或需求]", ""),
    ("daybook-today", "Daybook：查看今天的行程、例行公事與待辦（唯讀）", "[日期或查詢需求]", "今天要做什麼？只讀取既有行程與例行公事，不新增或修改待辦。"),
    ("daybook-plan", "Daybook：安排並儲存今天的待辦", "[安排需求；只要建議請註明]", "幫我安排並儲存今天的待辦，遵守現行的例行公事、工作量與 LeetCode 規則，只安排今天。"),
    ("daybook-review", "Daybook：複盤今天；提供心得才會記錄", "[日期或心得]", "幫我複盤今天，只讀取實際完成與待辦狀況；先不要儲存心得或修改待辦。"),
    ("daybook-status", "Daybook：查看日、週、月完成狀況（唯讀）", "[day、week、month 或日期]", "day"),
    ("daybook-short", "Daybook：列出未完成的短期待辦與截止日（唯讀）", "[基準日期或查詢需求]", "列出所有未完成的短期待辦，包含逾期與未來安排，依截止日排序，同一系列合併顯示。只查詢，不修改資料。"),
)

_ROUTE_FIELDS = (
    "chat_id", "chat_type", "chat_name", "thread_id", "user_id", "user_id_alt",
    "user_name", "scope_id", "parent_chat_id", "message_id", "profile",
)


def _current_origin():
    # Context variables preserve each concurrent Discord request's route.
    from gateway.session_context import get_session_env

    if get_session_env("HERMES_SESSION_PLATFORM") != "discord":
        return None
    origin = {"platform": "discord"}
    for field in _ROUTE_FIELDS:
        value = get_session_env("HERMES_SESSION_" + field.upper())
        if value:
            origin[field] = value
    if not origin.get("chat_id") or not origin.get("user_id"):
        return None
    return origin


def _invoke(ctx, name, default_instruction, raw_args):
    try:
        from gateway.session_context import get_session_env

        platform = get_session_env("HERMES_SESSION_PLATFORM")
        origin = _current_origin() if platform == "discord" else None
    except Exception:
        return "無法確認目前的 Discord 對話與使用者，未執行 Daybook。請在 Discord 重新輸入指令。"
    if platform and (platform != "discord" or origin is None):
        return "無法確認目前的 Discord 對話與使用者，未執行 Daybook。請在 Discord 重新輸入指令。"

    instruction = raw_args.strip()
    if origin is not None and name == "daybook" and not instruction:
        return _HELP

    try:
        from agent.skill_commands import build_skill_invocation_message, get_skill_commands, resolve_skill_command_key
        from agent.skill_utils import get_disabled_skill_names

        key = resolve_skill_command_key(name)
        skill = get_skill_commands().get(key) if key else None
        if not skill:
            return "找不到已安裝的 Daybook 技能，未執行操作。請重新安裝 Daybook 技能。"
        if skill.get("name") in get_disabled_skill_names(platform=platform or "cli"):
            return "這個 Daybook 技能目前停用，未執行操作。"

        # Expand the skill before injection: injected messages are conversational input,
        # and dispatching the same slash name again would resolve this plugin command.
        # A terminal invocation retains the skill's original bare-command semantics.
        user_instruction = (instruction or default_instruction) if origin is not None else instruction
        message = build_skill_invocation_message(key, user_instruction)
        if not message:
            return "無法載入 Daybook 技能，未執行操作。請重新安裝 Daybook 技能。"
        # Without an origin, Hermes accepts only its attached local REPL; a gateway
        # cannot guess a conversation from a missing route.
        accepted = ctx.inject_message(message, origin=origin) if origin is not None else ctx.inject_message(message)
        if not accepted:
            return "無法啟動 Daybook，未執行操作。請確認 Hermes 對話與 Daybook 指令連接已啟用後重試。"
    except Exception:
        return "Daybook 指令啟動失敗，未確認操作已執行。請稍後重試。"
    # The normal host turn sends its response in the original chat or terminal.
    return None


def register(ctx):
    ctx.register_hook("pre_llm_call", _leetcode_context)
    for name, description, args_hint, default_instruction in _COMMANDS:
        def handler(raw_args, name=name, default_instruction=default_instruction):
            return _invoke(ctx, name, default_instruction, raw_args)

        ctx.register_command(name, handler, description=description, args_hint=args_hint)
