"""Exercise the plugin against installed Hermes APIs in an isolated temporary profile."""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import chdir
from queue import Queue
from types import SimpleNamespace


PROJECT = Path(__file__).resolve().parents[1]
HERMES_SOURCE = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(HERMES_SOURCE))
sys.dont_write_bytecode = True


def run():
    temporary_root = PROJECT / "outputs"
    temporary_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="daybook-shortcuts-", dir=temporary_root) as temporary, chdir(temporary):
        home = Path(temporary)
        os.environ["HERMES_HOME"] = str(home)
        os.environ.pop("HERMES_PLATFORM", None)
        names = ("daybook", "daybook-today", "daybook-plan", "daybook-review", "daybook-status")
        for name in names:
            shutil.copytree(PROJECT / "integrations/hermes" / name, home / "skills" / name)
        shutil.copytree(PROJECT / "integrations/hermes/daybook-shortcuts", home / "plugins/daybook-shortcuts")
        config = {"plugins": {"enabled": ["daybook-shortcuts"], "isolation": "in_process",
                              "entries": {"daybook-shortcuts": {"allow_gateway_injection": True}}}}

        def save_config():
            (home / "config.yaml").write_text(json.dumps(config), encoding="utf-8")

        save_config()
        from hermes_cli.plugins import get_plugin_manager
        from gateway.session_context import set_session_vars, clear_session_vars
        from agent.skill_commands import extract_user_instruction_from_skill_message, get_skill_commands
        from gateway.platforms.event import MessageEvent, MessageType
        from gateway.session import SessionSource
        from gateway.config import Platform

        manager = get_plugin_manager()
        manager.discover_and_load()
        loaded = manager._plugins["daybook-shortcuts"]
        assert loaded.enabled and not loaded.error, loaded.error
        commands = manager._plugin_commands
        assert set(commands) == set(names), set(commands)
        assert all(commands[name]["args_hint"] for name in names)

        captured = []
        lock = threading.Lock()

        def sink(**payload):
            with lock:
                captured.append(payload)
            return True

        manager.set_gateway_message_injector(object(), sink)

        def invoke(name, args="", *, user="u-a", chat="chat-a", **extra):
            tokens = set_session_vars(platform="discord", chat_id=chat, chat_type="thread",
                                      chat_name="Daybook test", thread_id=chat, user_id=user,
                                      user_name=user, scope_id="guild-test", parent_chat_id="parent-test",
                                      message_id="message-test", profile="default", **extra)
            try:
                return commands[name]["handler"](args)
            finally:
                clear_session_vars(tokens)

        assert "快速指令" in invoke("daybook")
        assert not captured

        for name in names[1:]:
            assert invoke(name) is None
        assert len(captured) == 4
        assert set(get_skill_commands()) >= {"/" + name for name in names}
        assert not list(home.glob("sessions/*")), "cold invocation must not require a stored session"

        for item in captured:
            assert item["plugin_id"] == "daybook-shortcuts"
            assert "origin" in item and "session_key" not in item
            assert item["origin"] == {"platform": "discord", "chat_id": "chat-a", "chat_type": "thread",
                                      "chat_name": "Daybook test", "thread_id": "chat-a", "user_id": "u-a",
                                      "user_name": "u-a", "scope_id": "guild-test", "parent_chat_id": "parent-test",
                                      "message_id": "message-test", "profile": "default"}
            assert item["content"].startswith("[IMPORTANT: The user has invoked the ")
            assert "skill_view" in item["content"]
            event = MessageEvent(text=item["content"], message_type=MessageType.TEXT,
                                 source=SessionSource.from_dict(item["origin"]), internal=True,
                                 allow_gateway_control=False)
            assert event.get_command() is None, "expanded skill must not recurse into slash dispatch"
        instructions = [extract_user_instruction_from_skill_message(item["content"]) for item in captured]
        assert "只讀取既有" in instructions[0]
        assert "安排並儲存今天" in instructions[1]
        assert "先不要儲存" in instructions[2]
        assert instructions[3] == "day"

        requested = "只給建議，不要儲存。保留 20:30 的 meeting。"
        assert invoke("daybook-plan", requested) is None
        assert extract_user_instruction_from_skill_message(captured[-1]["content"]) == requested

        # Plugin names precede skills in the classic CLI dispatcher. Preserve the
        # skills' bare-command behavior instead of applying Discord write defaults.
        cli = SimpleNamespace(_pending_input=Queue(), _interrupt_queue=Queue(), _agent_running=False)
        manager._cli_ref = cli
        tokens = set_session_vars(platform="", chat_id="", user_id="")
        try:
            assert commands["daybook-plan"]["handler"]("") is None
            message = cli._pending_input.get_nowait()
            assert extract_user_instruction_from_skill_message(message) is None
            assert "安排並儲存今天的待辦" not in message
            assert commands["daybook-plan"]["handler"](requested) is None
            assert extract_user_instruction_from_skill_message(cli._pending_input.get_nowait()) == requested
            assert commands["daybook"]["handler"]("") is None
            assert cli._pending_input.get_nowait().startswith("[IMPORTANT: The user has invoked the ")
        finally:
            clear_session_vars(tokens)

        before = len(captured)
        assert "未執行" in invoke("daybook-today", user="")
        assert "未執行" in invoke("daybook-today", chat="")
        tokens = set_session_vars(platform="telegram", chat_id="chat-a", user_id="u-a")
        try:
            assert "未執行" in commands["daybook-today"]["handler"]("")
        finally:
            clear_session_vars(tokens)
        assert len(captured) == before
        assert cli._pending_input.empty(), "another platform must never fall back to the terminal"
        manager._cli_ref = None
        tokens = set_session_vars(platform="", chat_id="", user_id="")
        try:
            assert "未執行" in commands["daybook-plan"]["handler"]("")
        finally:
            clear_session_vars(tokens)
        assert len(captured) == before, "a missing gateway origin must not guess a destination"

        barrier = threading.Barrier(2)

        def concurrent(user, chat):
            tokens = set_session_vars(platform="discord", chat_id=chat, chat_type="dm", user_id=user)
            try:
                barrier.wait(timeout=10)
                assert commands["daybook-today"]["handler"](user) is None
            finally:
                clear_session_vars(tokens)

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(concurrent, "u-1", "chat-1"), pool.submit(concurrent, "u-2", "chat-2")]
            for future in futures:
                future.result(timeout=30)
        for item in captured[-2:]:
            user = item["origin"]["user_id"]
            assert item["origin"]["chat_id"] == "chat-" + user[-1]
            assert extract_user_instruction_from_skill_message(item["content"]) == user

        before = len(captured)
        config["skills"] = {"platform_disabled": {"discord": ["daybook-today"]}}
        save_config()
        assert "未執行" in invoke("daybook-today")
        assert len(captured) == before

        config["skills"] = {}
        config["plugins"]["entries"]["daybook-shortcuts"]["allow_gateway_injection"] = False
        save_config()
        assert "未執行" in invoke("daybook-status")
        assert len(captured) == before
        manager.unload()
        print(json.dumps({"passed": True, "commands": len(names), "checks": [
            "real plugin discovery", "real skill expansion", "cold-origin routing envelope",
            "no slash recursion", "write intent defaults", "suggestions unchanged", "missing identity denied",
            "classic CLI fallback preserves skill defaults", "other platforms and missing gateway origin denied",
            "concurrent context isolation", "disabled skill denied", "injection permission denied"
        ]}))


if __name__ == "__main__":
    run()
