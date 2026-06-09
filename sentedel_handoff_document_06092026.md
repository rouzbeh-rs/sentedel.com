# Sentedel — Project Handoff Document
## Complete Summary of Work Done & Future Directions
### Updated June 9, 2026 (v2.1 — NTE-aware pipeline)

---

## 1. THE CONCEPT

### Origin
Started from analyzing a resume of a healthcare IT professional with 5+ years managing EDI Transactions teams at WellMed (Optum/UnitedHealth Group) on the **payer side** (insurance company side) of healthcare claims processing. The question was: what startup could this person build using their expertise + LLMs?

### The Insight
Almost every AI startup in healthcare claims targets the **provider side** (hospitals trying to get paid). Very few build for the **payer's internal operations** — the teams that receive, validate, adjudicate, and process claims inside the insurance company. That payer-side perspective is rare and commercially valuable.

### The Platform Vision
**Sentedel** (formerly explored as "Claredi," "Cleardi," and others) is the **comprehensive payer-side EDI intelligence platform**. It turns payer EDI transaction data into the intelligence that powers the next generation of healthcare claims AI.

The name "Sentedel" comes from "sentinel" + "EDI" — a sentinel guarding EDI data. Domain: sentedel.com (live).

### Three Core Pillars
1. **PHI De-Identification Engine** — AI-powered, X12-native PHI detection and redaction using fine-tuned models (not rule-based), now including NTE free-text segment support
2. **EDI Benchmark Suite** — First standardized benchmark for evaluating PHI detection in EDI data, with multi-threshold evaluation and structured vs NTE breakdown
3. **Open Data Platform / Consortium** — Contribution-based platform where payers share de-identified EDI patterns and receive shared model access, benchmarking, and operational intelligence

### Additional Dimensions (longer-term)
- EDI-specialized LLM fine-tuned on transaction patterns
- Data licensing of de-identified EDI operational intelligence
- LLM-powered synthetic EDI data generation
- EDI error taxonomy and detection

---

## 2. COMPETITIVE LANDSCAPE

### Provider-Side (Crowded — NOT our market)
- **Stedi** — $142M raised. API-first clearinghouse. 1B+ transactions/year.
- **Adonis** — $95M+ raised. AI denial management for providers.
- **Waystar** — Public, $1.1B revenue. Claims AI.
- Sprout.ai, Avallon, Commure, FinThrive — various stages.

### Payer-Side Incumbents (Our market — underserved)
- **HealthEdge** — Dominant CAPS vendor for health plans. Adding AI features. Not AI-native.
- **Cotiviti** — Payment integrity and fraud detection. Founded 1979.
- **Edifecs** — EDI infrastructure. 2026 Best in KLAS for CMS Payer Interoperability. Not AI-native.
- **Availity** — Clearinghouse between payers and providers.
- **Qantev** — €40M+ raised. AI claims for international health/life insurers. Paris-based.
- **Inovaare** — Payer compliance platform. AI agents for CMS regulatory tracking.

### EDI De-Identification Tools (Direct competitors for Pillar 1)
- **IRI DarkShield** — Rule-based. $6K-$60K. Recently added X12 wizards. Uses location-based path matchers — you manually configure which segments to mask. Has a free trial available. **Cannot handle NTE free-text segments** — only masks PHI in configured element positions.
- **John Snow Labs** — Healthcare NLP leader. ~$7K/month per license (~$84K/year). 3,000+ models covering de-identification across free text, FHIR, PDF, DICOM. Achieves 0.978 F1 on clinical notes (i2b2 benchmark). **However, their models are trained on EHR narratives — not X12 EDI.** They would not recognize PHI in structured segments like NM1 or N3.
- **Edifecs SpecBuilder** — Enterprise platform. Companion guide authoring with some masking features. Not primarily a de-ID tool.
- **EdiFabric** — .NET parsing library for EDI. No built-in de-identification. Developer toolkit only.
- **Perforce Delphix** — Enterprise data masking across sources including EDI. Commercial.

### Key Finding: THE NTE SEGMENT GAP
Industry feedback from a professional working in this space confirmed that NTE free-text segments are "where most of these solutions lag." This was validated by our v2.1 benchmark: general-purpose PII models (GLiNER) achieve only 29-41% recall on NTE PHI, and even the unfine-tuned Privacy Filter only manages 67%. Sentedel v2.1 achieves 93% NTE recall — the first model to handle both structured EDI and embedded free text effectively.

### Data Licensing Landscape (Pillar 3 context)
- **Truveta** — Health systems pooling EHR + claims outcome data for research licensing
- **HealthVerity** — $142M raised. Marketplace for licensing de-identified claims data. 190M+ patients.
- **Datavant** — Tokenization and privacy-preserving linkage.
- **Key gap:** All license clinical/outcomes data for pharma buyers. Nobody licenses EDI operational/transactional pattern data for AI training.

---

## 3. REGULATORY FRAMEWORK

### HIPAA Safe Harbor
- Once PHI is properly de-identified (18 identifiers removed), data falls outside HIPAA restrictions.
- EDI data is ideal for Safe Harbor — PHI sits in known, predictable X12 segments (NM1, N3, N4, DMG, PER, REF) and in NTE free-text segments.
- Transactional patterns (codes, formats, error types) are domain knowledge, not PHI.

### Re-Identification Risk
- Research shows 63-87% of U.S. population identifiable from birth date + gender + zip code alone.
- Even partial identifiers (birth year, zip prefix) enabled 25-28% re-identification in studies.
- This informed our multi-threshold benchmark design — connecting overlap percentages to actual compliance risk.

---

## 4. TECHNICAL WORK COMPLETED

### 4.1 Synthetic EDI Generator (Custom Built)
We built a custom Python generator (not using any external tool) that produces structurally valid 837P professional claims using the Faker library.

**Diversity features added in v1.5+:**
- Hyphenated last names (8%): JOHNSON-WILLIAMS
- Apostrophe names: O'BRIEN, MCCARTHY, MACDONALD
- Name suffixes: JR, SR, III, MD, DO
- Double first names: MARY JANE
- PO boxes, suite numbers, apartment numbers, rural routes
- 6 different member ID format patterns (dashed, numeric-only, varied prefixes)
- 4 phone formats (flat, dashed, parenthesized, dotted)
- 16 payer names including TRICARE, MEDICAID, MEDICARE
- 26+ diagnosis codes, 24+ CPT codes
- Varied claim ID prefixes and group number formats

**NTE injection added in v2+:**
- 35% of transactions include NTE segments at valid X12 positions
- NTE in Loop 2300 (claim-level, after CLM and before HI)
- PHI entities inside NTE are tracked with exact global character offsets
- v2 used handcrafted templates; v2.1 uses LLM-generated templates (Qwen 2.5 7B)

**The generator tracks all PHI values and their types**, enabling perfect auto-labeling for training data — including NTE free-text PHI with precise offset tracking through placeholder substitution.

### 4.2 LLM NTE Template Generation (v2.1)

The v2.1 pipeline introduced LLM-generated NTE content using Qwen 2.5 7B-Instruct (4-bit quantized, ~10GB VRAM).

**How it works:**
1. Qwen generates clinical note templates using placeholder tokens (`<<PATIENT_NAME>>`, `<<MEMBER_ID>>`, `<<PATIENT_DOB>>`, etc.)
2. A system prompt instructs varied style: formal, abbreviated, clinical shorthand, mixed casing
3. Templates are generated in batches of 10 (50 batches targeting 500 templates)
4. During EDI generation, a random template is selected and placeholders are replaced with Faker-generated PHI values
5. Offset tracking happens during substitution — gives perfect labels without annotation

**v2.1 generation results:** 137 LLM templates + 80 handcrafted fallback = 217 total templates. JSON parse rate ~46% (expected for a 7B model). The fallback ensures the pipeline never stalls.

**Key insight:** The placeholder approach preserves the LLM's naturalistic sentence variation while maintaining exact offset tracking for training labels. The LLM decides structure, abbreviations, and which PHI to include; the generator controls the actual PHI values.

### 4.3 Model Fine-Tuning Pipeline

**Base model:** `openai/privacy-filter` from HuggingFace
- 1.5B total parameters, 50M active at inference (sparse MoE, 128 experts, top-4 routing)
- Apache 2.0 license
- Token classifier (not generative) — labels each token as background or one of 8 PII categories
- Categories: account_number, private_person, private_address, private_phone, private_email, private_date, private_url, secret
- Uses BIOES tagging scheme (33 total labels: 8 categories × 4 boundary tags + background)

**Label mapping (EDI PHI types → model categories):**
| EDI PHI Type | Model Category |
|---|---|
| patient_name, contact_name | private_person |
| patient_address, provider_address | private_address |
| phone_number | private_phone |
| email_address | private_email |
| date_of_birth | private_date |
| member_id, npi, tax_id, group_number, claim_id, entity_id | account_number |

**Training versions run:**

| Version | Transactions | NTE? | Epochs | Hardware | Time | Notes |
|---|---|---|---|---|---|---|
| v1 | 3,000 | No | 3 | A100 80GB | 125 min | First successful run. F1=60.7% relaxed. |
| v1.5 | 5,000 | No | 3 | L4 24GB | 237 min | BIOES caused boundary collapse. Strict F1=0.5%. |
| **v1.6** | **5,000** | **No** | **3** | **L4 24GB** | **91 min** | **Best structured-only. F1=86.0% relaxed, 78.3% strict. 100% recall at 60%.** |
| v2 | 3,000 | Template | 3 | L4 24GB | 123 min | First NTE test. Template NTE too easy (99.3% NTE recall). Proved dual-model routing unnecessary. |
| **v2.1** | **5,000** | **LLM (Qwen)** | **3** | **L4 24GB** | **211 min** | **Best overall. F1=99.7% relaxed, 89.9% strict. NTE recall=93.0%. Comprehensive benchmark.** |

### 4.4 v2 Experiment: Dual-Model Routing (Archived)

v2 tested a segment-aware routing architecture with two models:
- **Structural model** (fine-tuned Privacy Filter) for NM1, N3, N4, DMG, PER, REF segments
- **Clinical de-ID model** (obi/deid_roberta_i2b2, RoBERTa-large) for NTE free-text segments
- X12 parser identified segment types and routed content to the appropriate model
- Offset reconciliation layer mapped NTE-local offsets back to global transaction coordinates
- Union fusion with 50% overlap deduplication merged results

**Result: Routing hurt performance.** The structural model alone achieved 99.3% NTE recall on template data, while the routed pipeline only achieved 68.2% — because the clinical model (trained on EHR notes, not EDI) performed worse on uppercase, EDI-adjacent NTE text. The routing was actively suppressing correct detections.

**Key decision:** Dropped the dual-model approach. Single structural model fine-tuned on NTE-containing data handles both structured and free-text PHI. Simpler architecture, better results.

### 4.5 v2.1 Results: NTE-Aware Single Model (Current Best)

**Multi-threshold evaluation (500 test transactions, 162 with NTE):**

| Threshold | Precision | Recall | F1 |
|---|---|---|---|
| Strict (100%) | 90.1% | 89.8% | 89.9% |
| High (80%) | 99.3% | 99.0% | 99.1% |
| Moderate (60%) | 99.8% | 99.6% | 99.7% |
| Relaxed (50%) | 99.9% | 99.6% | 99.7% |

**Competitor comparison (relaxed F1):**

| Model | Relaxed F1 | Strict F1 | NTE Recall | Latency |
|---|---|---|---|---|
| **Sentedel v2.1** | **99.7%** | **89.9%** | **93.0%** | **—** |
| OpenAI Privacy Filter (baseline) | 30.0% | 1.4% | 67.1% | — |
| GLiNER PII Base (Knowledgator) | 58.0% | 52.8% | 29.4% | — |
| NVIDIA GLiNER PII | 43.4% | 37.8% | 40.8% | — |

**Structured vs NTE recall (relaxed 50%):**

| Model | Structured | NTE |
|---|---|---|
| **Sentedel v2.1** | **99.7%** | **93.0%** |
| OpenAI Privacy Filter | 65.2% | 67.1% |
| GLiNER PII Base | 53.9% | 29.4% |
| NVIDIA GLiNER PII | 38.2% | 40.8% |

**Per-category recall at 60% threshold (v2.1):**
- 100.0%: patient_address, provider_address, entity_id, npi, phone_number, member_id, group_number, tax_id, claim_id, email_address
- 99.8%: date_of_birth
- 97.9%: contact_name
- 96.9%: patient_name

### 4.6 Multi-Threshold Evaluation Framework

Consistently applied across all versions. Four thresholds capture different compliance needs:

| Threshold | Overlap Required | What It Measures | Compliance Relevance |
|---|---|---|---|
| Strict (100%) | Exact start and end | Boundary precision | Character-level accuracy for automated redaction |
| High (80%) | ≥80% character overlap | Near-exact matching | Reliable for most regulatory purposes |
| Moderate (60%) | ≥60% overlap | Region detection | Detects the right field, may clip edges |
| Relaxed (50%) | ≥50% overlap | Value coverage | At least half the PHI value is detected |

v2.1 added **per-source breakdown** (structured vs NTE) at each threshold and **per-category breakdown** across all 13 PHI types.

### 4.7 Training Configuration (v2.1 Optimized)

| Parameter | Value | Notes |
|---|---|---|
| Base model | openai/privacy-filter | 1.5B sparse MoE |
| Label strategy | S-tags only | BIOES caused boundary collapse in v1.5 |
| Batch size (L4) | 4 | Reduced from v1.6's 8 due to longer NTE sequences (~500 tokens vs ~384) |
| Gradient accumulation | 4 | Effective batch = 16 |
| Learning rate | 3e-4 | Validated in v1.6 |
| Epochs | 3 | Val loss stabilizes by epoch 2 |
| Max sequence length | 512 | Truncation ceiling; dynamic padding per-batch |
| Precision | bf16 | With gradient checkpointing |
| Dynamic padding | Yes | DataCollatorForTokenClassification handles per-batch |

**Sequence length note:** With NTE segments, median sequence length is ~512 tokens with 52% hitting truncation. NTE in Loop 2300 (after CLM) typically falls within the 512-token window. Service-line NTE at the end of transactions may be truncated. Increasing MAX_LEN to 768 would capture more but requires batch_size=2 on L4 (slower training). Current 512 is the practical balance.

---

## 5. FILES REFERENCE

### Code
1. **claredi_full_pipeline.py** (v1) — First working end-to-end pipeline
2. **claredi_full_pipeline_v15.py** — Diverse data + BIOES labels + multi-threshold eval
3. **claredi_pipeline_v16_optimized.py** — v1.6 pipeline. S-tags + dynamic padding + optimized training. 91 min runtime. Best structured-only results.
4. **sentedel_v2_nte_experiment.py** — v2 pipeline. NTE template injection + dual-model routing experiment. Proved single model is sufficient.
5. **sentedel_v21_nte_experiment.py** — **v2.1 pipeline (best, use this).** LLM NTE generation + single structural model + comprehensive benchmark. 211 min runtime.
6. **sentedel_v21_charts.py** — Standalone chart generator with hardcoded v2.1 results. Generates 3 PNG files in Sentedel dark theme.
7. **sentedel_v21_benchmark.html** — Standalone HTML benchmark summary for export as PNG.
8. **Comprehensive validation script** — 6-test diagnostic suite for verifying benchmark results

### Presentations & Demos
1. **Pitch deck** (PPTX, 15 slides) — Claredi branding (pre-rename). Problem, landscape, vision, 5 dimensions, HIPAA framework, technical pipeline, fine-tuning detail, synthetic data pipeline, demos, monetization, buyers, founder-market fit, why now, closing.
2. **Platform demo** (HTML) — Interactive demo with 4 tabs: PHI De-Identifier (with scan animation), Benchmark Suite (animated leaderboard), Open Platform (incentive design, contribution scoring, tier structure), Roadmap.
3. **Platform demo** (JSX/React) — Same as above in React format.

### Model Artifacts (in Colab)
- v1.6 checkpoint at `/content/claredi_edi_phi_v16/` — best structured-only model
- v2.1 checkpoint at `/content/sentedel_v21_model/` — **best overall model (NTE-aware)**
- Benchmark results JSON, chart PNG, markdown report, sample de-ID output
- All packaged as `sentedel_v21_package.zip`

**Note:** The v2.1 zip does NOT include training data (JSONL) or LLM-generated NTE templates. These exist only in Colab memory during the run. Save them separately before the session expires if needed for reproducibility.

---

## 6. OPEN PLATFORM DESIGN (Pillar 3)

### Incentive Structure
The open platform uses contribution-based tiering to incentivize payers to share de-identified EDI patterns:

**Bronze** (< 100K patterns/quarter):
- Free Sentedel De-ID Engine
- Anonymized benchmark report (quarterly)
- Read-only shared model API
- Community forum access

**Silver** (100K – 500K patterns/quarter):
- Everything in Bronze
- Priority model API + higher rate limits
- Custom benchmark against your own data
- Companion guide compliance checker
- Early access to new model versions

**Gold** (500K+ patterns/quarter):
- Everything in Silver
- Dedicated model fine-tuned on your data profile
- Custom error taxonomy for your trading partners
- Co-authorship on benchmark publications
- Advisory board seat on governance

### Key Incentive Mechanisms
1. **Contribution scoring** — Scores based on volume, diversity (rare patterns worth more), and consistency
2. **Privacy-first** — De-ID engine runs inside payer's infrastructure. Only hashed patterns transmitted.
3. **Network effects** — More payers = better model for everyone
4. **Competitive benchmarking** — See how your operations compare to anonymized industry averages
5. **Governance** — Gold-tier members participate in platform governance decisions

---

## 7. FUTURE DIRECTIONS

### Immediate Next Steps
1. **Improve LLM template generation reliability.** Current 46% JSON parse rate from Qwen 2.5 7B leaves room for improvement. Options: use a larger model (14B), structured output with JSON mode, or a two-pass approach (generate text, then extract placeholders).

2. **Save training artifacts to the zip.** Add JSONL write step and LLM template save to the v2.1 pipeline so the package is fully reproducible.

3. **Segment-aware post-processing** — Filter that suppresses false positives in non-PHI segments (SV1, DTP, HI, LX, SE, GE, IEA). Expected to push precision further. Still relevant even with v2.1's 99.8% precision at moderate threshold.

4. **Publish the benchmark** — On HuggingFace (dataset + evaluation scripts), GitHub (generator + benchmark runner), and the Sentedel website (leaderboard). Include the NTE recall comparison — this is the differentiating metric.

5. **Write the NTE segment whitepaper** — Technical blog post or whitepaper covering: why NTE segments are the gap in EDI de-identification, how existing tools fail on free text within structured data, and how fine-tuning on NTE-injected synthetic data solves it. This owns the search results for this specific problem.

### Bridging the Gap to Enterprise Readiness
6. **Real data validation through design partners.** Find 2-3 clearinghouses or TPAs willing to run the model on their own data internally (model stays in their environment, only aggregate metrics shared back). This is the single most important step for credibility.

7. **CMS synthetic data validation.** Run the model against CMS SynPUF or Synthetic Medicare Data. Government-generated synthetic data carries more credibility than our own generator.

8. **Compliance documentation.** Produce a model card (base model, training methodology, intended use, limitations), a bias assessment (performance across name demographics, hyphenated names, compound names), and a HIPAA validation report mapping the 18 Safe Harbor identifiers to model recall rates.

9. **Production API packaging.** FastAPI wrapper + Docker container with health checks, input validation, logging. Simple endpoint: raw X12 text in, redacted transaction out (or detected PHI spans). Transforms the project from experiment to deployable component.

### Medium-Term (1-3 months)
10. **Expand to more transaction types** — 837I (institutional claims), 835 (remittance advice), 270/271 (eligibility), 276/277 (claim status). Each has its own segment structure and PHI locations. The generator + LLM template approach is extensible to these formats.

11. **Increase NTE template diversity.** Move from 217 templates to 1,000+ by either using a larger LLM, running Qwen with better JSON parsing (e.g., structured output constraints), or using the Anthropic/OpenAI API for higher-quality generation.

12. **Address sequence truncation.** 52% of v2.1 sequences hit the 512-token limit. Options: increase MAX_LEN to 768 with batch_size=2, use Unsloth for memory-efficient training, or train on A100 where batch_size=8 with 768 tokens fits.

13. **Scale training data to 10K-50K transactions.** More diverse structured patterns + more NTE variation. May require A100 or training optimization.

14. **Real-world EDI validation** — Validate on real (manually reviewed) EDI transactions from payer operations to confirm synthetic training transfers to production data.

### Longer-Term (3-6 months)
15. **EDI-specialized LLM** — Fine-tune Mistral 7B or Llama 3 on combined corpus for claims intelligence tasks (rejection prediction, error detection, companion guide compliance).

16. **EDI error taxonomy** — Structured classification of every EDI failure mode from the payer perspective. Publishable standard.

17. **Re-identification risk research** — Connect overlap thresholds to actual re-identification probability by PHI type. Novel research contribution.

18. **Open platform MVP** — Build consortium infrastructure with contribution scoring, tier management, federated model access.

### Training Pipeline Optimization Ideas
- **Unsloth** — 12x faster MoE training with Triton kernels. Compatible with A100s. Would dramatically reduce training time.
- **Sequence packing** — Combine multiple short sequences into single tensors. Less relevant now with NTE (sequences are longer, less padding waste).
- **LoRA** — Failed to attach in v1.6 due to MoE architecture. Worth retrying with Unsloth's LoRA implementation.
- **A100 access** — Would allow batch_size=8 with MAX_LEN=768, cutting training time to ~90 min even with NTE.

---

## 8. KEY TECHNICAL DECISIONS & LESSONS LEARNED

1. **S-tags > BIOES for this model/data combination.** BIOES alignment caused boundary precision to collapse (0.5% strict F1 vs 76.4% with S-tags). The tokenizer's subword splits don't align cleanly with PHI span boundaries in EDI data.

2. **Synthetic data works excellently for PHI detection training.** The model doesn't need clinical realism — it needs structural context (which segment, which qualifiers surround the value). Synthetic data provides perfect labels with zero annotation cost.

3. **The training data generator IS a core asset.** It encodes domain knowledge about what real EDI data looks like. The more diverse and realistic it becomes, the better the model gets. This now includes the LLM template generation pipeline for NTE content.

4. **General-purpose PII models fail catastrophically on EDI.** The baseline Privacy Filter has 96% F1 on standard PII benchmarks but 1.4% on EDI at strict matching. GLiNER models achieve 53-58% relaxed F1. This gap IS the market opportunity.

5. **Multi-threshold evaluation is essential for compliance claims.** Single-score benchmarks hide whether a model finds the right region vs. the exact entity. The gap between relaxed and strict scores reveals boundary precision.

6. **NTE segments are the key differentiator.** Industry feedback confirmed NTE is "where most solutions lag." Our benchmark proves it: GLiNER gets 29% NTE recall, NVIDIA gets 41%, even the base Privacy Filter only gets 67%. Sentedel v2.1 achieves 93%. This is the competitive moat.

7. **Single model > dual model for this task.** v2 proved that a single structural model fine-tuned on NTE-containing data outperforms a routing architecture with a specialized clinical NER model. The clinical model (obi/deid_roberta_i2b2) was trained on lowercase EHR narratives and fails on uppercase EDI-style NTE text. Simpler is better here.

8. **Template-based NTE is too easy — LLM diversity is necessary.** v2's template NTE achieved 99.3% recall, which proved the pipeline works but didn't stress-test the model. v2.1's LLM-generated NTE dropped to 93% — still strong but now measuring real generalization. The gap between 99.3% and 93% is the value of LLM diversity.

9. **Placeholder-based offset tracking is the right approach for NTE.** Rather than using an LLM to generate text and then trying to find entities after the fact (error-prone), generate text with placeholders and track offsets during substitution. Perfect labels, zero annotation cost, and the LLM still controls sentence structure and style.

10. **Batch size is constrained by sequence length, not model size.** The MoE model fits on an L4 at any batch size, but longer sequences (NTE pushes to ~500 tokens) consume quadratically more memory during attention. v1.6's batch_size=8 only worked because sequences were ~384 tokens. v2.1 requires batch_size=4 with ~500 tokens for equivalent memory usage.

11. **Colab environment is fragile.** Transformers from source + Colab's pre-installed packages create version conflicts. The working install sequence: install everything from PyPI EXCEPT transformers, then install transformers from source with `--no-deps`, then flush module cache. Additionally, always restart the runtime between failed and new runs — OOM errors leave GPU memory dirty.

---

## 9. LICENSING & BUSINESS MODEL CONSIDERATIONS

### What's Sellable
Two distinct IP assets with different value propositions:

**The fine-tuned model** (one-time license): Estimated $15K-$50K. Buyer gets the checkpoint, uses it indefinitely. No recurring revenue, no moat after transfer. Suitable for a one-time deal with a clearinghouse or TPA that wants to run de-identification internally.

**The training pipeline** (technology license): Estimated $75K-$200K one-time or $30K-$60K annually. Includes the synthetic data generator, LLM NTE template generation system, fine-tuning methodology, and benchmark framework. Buyer can retrain on new transaction types, adapt to their data, and update as standards evolve. This is the higher-value asset because it's a capability, not just a product.

### Target Buyers
Not enterprises that would compare against John Snow Labs' comprehensive platform ($84K/year, 3,000+ models). Instead, target companies already processing X12 EDI that need format-specific de-identification: clearinghouses, TPA platforms, revenue cycle companies, health data analytics firms. Their current options are rule-based masking (misses NTE) or nothing (compliance risk).

### Prerequisite for Licensing
Enterprise healthcare buyers require: validation on real data (not just synthetic benchmarks), compliance documentation (model card, bias assessment, HIPAA validation report), and a deployable artifact (API or Docker container). The path from current state to first licensable deal is estimated at 2-3 months of focused effort, gated by finding a design partner for real-data validation.

---

## 10. VERSION HISTORY

| Date | Version | Key Change |
|---|---|---|
| May 2026 | v1.0 | First working pipeline. 3,000 transactions. A100. F1=60.7% relaxed. |
| May 2026 | v1.5 | Diverse data + BIOES labels. Boundary collapse discovered. |
| May 2026 | v1.6 | S-tags + dynamic padding. 91 min. F1=86.0% relaxed, 78.3% strict. Best structured-only. |
| Jun 2026 | v2.0 | NTE template injection + dual-model routing. Proved routing unnecessary. |
| Jun 2026 | v2.1 | LLM NTE generation (Qwen 2.5 7B) + single model + comprehensive benchmark. F1=99.7% relaxed, 89.9% strict. NTE recall=93.0%. **Current best.** |

---

*Sentedel — Redact what's private.*
