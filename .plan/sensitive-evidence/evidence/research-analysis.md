# Sensitive Evidence Research Analysis

## Purpose

This evidence note summarizes public guidance and local Cartographer context for handling sensitive proposal inputs such as logs, error dumps, transcripts, screenshots, and private documents. It intentionally contains no raw sensitive artifact contents.

## Public Guidance Findings

1. **Logs commonly contain sensitive data and must be sanitized.** OWASP's Logging Cheat Sheet says sensitive data should usually not be recorded directly in logs, including source code, session identifiers, access tokens, PII, passwords, database connection strings, encryption keys, payment data, high-classification data, commercially sensitive information, illegal-to-collect information, and opt-out data. It recommends removal, masking, sanitization, hashing, encryption, and de-identification where needed.
2. **Sensitive information in log files is a recognized weakness.** MITRE CWE-532 describes products writing sensitive information to log files. It warns that logs can become a less-protected path for attackers and recommends not writing secrets to logs, removing debug logs before production, protecting log files, and adjusting debug/production configurations.
3. **Secrets must not be committed and should be redacted before logging.** GitHub Docs define secrets as API keys, access tokens, database credentials, and private keys. They recommend least privilege, environment variables or secret-management tools, never hardcoding secrets, rotating exposed secrets, and ensuring secrets are redacted before logging.
4. **Privacy risk management and data minimization apply to evidence artifacts.** NIST's Privacy Framework is intended to help organizations identify and manage privacy risk while protecting individuals' privacy. For Cartographer, this supports collecting only the evidence needed for proposal reasoning and avoiding raw sensitive inputs in committed files.
5. **LLM workflows need sensitive-output controls.** OWASP's Top 10 for LLM Applications identifies Sensitive Information Disclosure as a major LLM risk. Cartographer should therefore isolate raw sensitive artifact review and require sanitized analysis outputs before proposal prose or fact graphs cite those artifacts.

## Local Cartographer Findings

1. Cartographer already treats topic `.plan/<topic>/` artifacts as intentional rationale that can be reviewed and committed.
2. Generated caches such as `.plan/_index/` are ignored and not durable rationale.
3. `.plan/_private/<topic>/` is gitignored and can serve as the local archive for raw sensitive artifacts that inform proposals but should not be committed.
4. The `workflow-optimization` proposal already demonstrates the pattern: a raw dogfooding session log lives in that topic's private folder, while `.plan/workflow-optimization/session-analysis.md` is the durable, sanitized proposal evidence.

## Proposed Evidence Pattern

When a user asks Cartographer to consider private artifacts, including files supplied before topic folders exist, the workflow should:

1. Derive or confirm the proposal topic from the request text before reading raw artifact contents.
2. Create `.plan/_private/<topic>/` and `.plan/<topic>/evidence/`, or use temporary `.plan/_private/_inbox/<id>/` only when the topic cannot be confirmed before intake.
3. Copy/move authorized files into private storage without parent-context inspection, using opaque names when original basenames may disclose sensitive information.
4. Treat raw `.plan/_private/<topic>/` files as private inputs, not map/fact/proposal evidence.
5. Dispatch a dedicated `cartographer-redactor` agent in fresh context with explicit artifact paths and redaction rules.
6. Write sanitized analysis documents under `.plan/<topic>/evidence/`.
7. Extract safe fact nodes and source nodes that reference the sanitized analysis docs, not the raw `.plan/_private/<topic>/` files.
8. Add map edges from sanitized evidence to affected project files/topics where the relationship is useful.
9. Validate that committed proposal artifacts do not include obvious secrets, PII, raw stack traces, tokens, or private document text.

## Sanitization Rules for Analysis Docs

Analysis docs may include:

- counts, timestamps rounded to useful granularity, categories, severities, durations, and aggregate metrics
- redacted examples with placeholders such as `<TOKEN>`, `<EMAIL>`, `<PATH>`, `<USER_ID>`, `<PRIVATE_DOC_TITLE>`
- file paths or project symbols only when they are already part of the public/project repository context or safe to disclose
- relationships to map/fact records, validation commands, and proposal goals

Analysis docs must not include:

- API keys, access tokens, session IDs, cookies, private keys, passwords, database connection strings, payment data, personal identifiers, private document contents, or full raw logs
- verbatim stack traces or request/response bodies unless explicitly classified safe and minimized
- enough adjacent context to reconstruct a secret or private document

## Sources

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- MITRE CWE-532: https://cwe.mitre.org/data/definitions/532.html
- GitHub Docs, Storing your secrets safely: https://docs.github.com/en/get-started/learning-to-code/storing-your-secrets-safely
- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Local workflow example: `.plan/workflow-optimization/session-analysis.md`
