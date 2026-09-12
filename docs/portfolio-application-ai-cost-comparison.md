# Portfolio application AI — cost comparison

Each fund application is screened once: uploaded documents are read, then an AI returns a score and written assessment. The figures below assume the **same workload** for every model so costs can be compared fairly.

---

## Workload (per application)

| Part | Amount | Unit |
|------|--------|------|
| Material sent to the model (input) | ~5,200 | tokens |
| Model reply (output) | ~2,000 | tokens |
| **Total per application** | **~7,200** | **tokens** |

Up to four uploaded documents are included (each capped at about 4,000 characters of extracted text), plus the application form and scoring instructions.

---

## Cost per application

| Model | Provider | Cost per application |
|-------|----------|----------------------|
| **GPT** | OpenAI | **$0.40** (40¢) |
| **Claude Opus 4.8** | Anthropic (`claude-opus-4-8`) | **$0.67** (67¢) |
| **Gemini 3.5 Flash** | Google (`gemini-3.5-flash`) | **$0.49** (49¢) |

---

## Cost at volume (estimated)

Estimated total spend if **every** application in the column is screened with that model:

| Number of applications (estimated) | GPT @ $0.40 | Claude Opus 4.8 @ $0.67 | Gemini 3.5 Flash @ $0.49 |
|-----------------------------------|-------------|---------------------------|----------------------------|
| 100 | $40 | $67 | $49 |
| 250 | $100 | $168 | $123 |
| 500 | $200 | $335 | $245 |
| 1,000 | $400 | $670 | $490 |
| 2,500 | $1,000 | $1,675 | $1,225 |
