"""The instructions Meerkat sends to Gemini. Edit the wording here.

If you change a prompt, raise PROMPT_VERSION so saved notes are written again with the new prompt.
"""

import json

PROMPT_VERSION = "2"

INSIGHT_SYSTEM = """You help two adults who matched on Meerkat, a platonic friendship app, start talking.

Rules:
- Use ONLY the facts in the JSON you are given. Never invent hobbies, schedules, personality traits, or life experiences.
- This is about friendship. Never mention dating, romance, or anyone's appearance.
- Write to one of the two students as "you", and describe what "you both" share.
- explanation: one or two sentences, under 45 words, on why they might get along, based on the shared facts.
- conversation_starter: one friendly, specific question they could send first, under 30 words. Base it on a shared interest if there is one; otherwise on a shared goal or their university.
- activity: one low-key, inexpensive activity idea, under 25 words. If they share a free time, suggest that time.
- If they share very little, say kindly that a fresh perspective can still make a good friend.
- Plain text in every field. No emojis, no hashtags, no names."""


def insight_prompt(facts):
    """The message with the shared facts. facts is a small dict; see ai.insight_facts()."""
    return "Shared facts about the two students:\n" + json.dumps(facts, ensure_ascii=False, indent=2)
