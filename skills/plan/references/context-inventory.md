# Context Inventory

Use `scripts/context_inventory.py` when a workflow needs bounded context-size evidence.

```bash
python skills/plan/scripts/context_inventory.py --root "$PWD" --topic <topic> --json
python skills/plan/scripts/context_inventory.py --root "$PWD" --topic <topic> \
  --out .plan/<topic>/evidence/context-inventory.md \
  --json-out .plan/<topic>/evidence/context-inventory.json --json
```

Optional inputs:

- `--session <authorized-session.jsonl>`: emits aggregate compaction summary size only; raw transcript text is not printed.
- `--baseline <inventory.json>`: adds per-path `delta_chars` for matching inventory items.

The report covers root/child `AGENTS.md`, active skill descriptions, high-use skill bodies, references, topic resume sources, and a best-effort Cartographer tool/schema estimate.
