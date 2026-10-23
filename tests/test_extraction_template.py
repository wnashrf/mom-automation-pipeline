import scripts.extraction_agent as ea

TRANSCRIPT = " ".join(["perkataan"] * 80)


def _capture(monkeypatch):
    cap = {}

    def fake_llm(system_prompt, user_prompt):
        cap["system"], cap["user"] = system_prompt, user_prompt
        return {}, 0, 0

    monkeypatch.setattr(ea, "call_llm", fake_llm)
    return cap


def test_custom_template_text_reaches_prompt_first(monkeypatch):
    cap = _capture(monkeypatch)
    ea.run_extraction(TRANSCRIPT, "custom", "# SEKSYEN A\n# SEKSYEN B")
    assert cap["user"].startswith("MEETING_FORMAT_TEMPLATE")
    assert "SEKSYEN A" in cap["user"]
    # Custom guidance must come after the steering rules so it overrides them.
    assert cap["system"].rfind("USER-SUPPLIED CUSTOM TEMPLATE") > cap["system"].find("RULES:")


def test_standard_ignores_template_text(monkeypatch):
    cap = _capture(monkeypatch)
    ea.run_extraction(TRANSCRIPT, "standard", "ignored")
    assert "MEETING_FORMAT_TEMPLATE" not in cap["user"]
    assert "STANDARD GOVERNMENT TEMPLATE" in cap["system"]
