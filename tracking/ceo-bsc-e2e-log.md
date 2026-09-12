
## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:06:03.591Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no jobs goal in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl (optional GL-driven push; not run)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 400 | supportingDocumentUrls must include at least one URL for uploaded supporting documents |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.9,"performanceLabel":"Satisfactory","sectionBlendScore":2.9,"sectionScores":{"A1":3,"A2":2.75,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":2.75,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.9,"performanceLabel":"Satisfactory","sectionBlendScore":2.9,"sectionScores":{"A1":3,"A2":2.75,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":2.75,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### DB snapshot (selected goals after run)

| formulaType | currentValue | bscEntryKind (syncConfig) |
|-------------|--------------|---------------------------|
| ROI | 12 | FINANCIAL_OUTCOME_ROI |
| FUNDING_RATE | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| CUSTOMER_SATISFACTION_INDEX | 78.4 | STAKEHOLDER_SURVEY |
| CHARTER_SCORE | 92 |  |

### Result

- **BSC steps:** at least one failure (see table). Check CONTINUE_ON_ERROR.
- **Generate:** OK


## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:06:52.599Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no jobs goal in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl (optional GL-driven push; not run)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 200 | OK |
| resource-budget-alignment | 200 | OK |
| inclusion-diversity-reporting | 400 | This goal does not match this endpoint. "Inclusive programming" is not set up for inclusion / diversity KPI. Please choose a goal aligned to this KPI. |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.9,"performanceLabel":"Satisfactory","sectionBlendScore":2.9,"sectionScores":{"A1":3,"A2":2.75,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":2.75,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.9,"performanceLabel":"Satisfactory","sectionBlendScore":2.9,"sectionScores":{"A1":3,"A2":2.75,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":2.75,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### DB snapshot (selected goals after run)

| formulaType | currentValue | bscEntryKind (syncConfig) |
|-------------|--------------|---------------------------|
| ROI | 12 | FINANCIAL_OUTCOME_ROI |
| FUNDING_RATE | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| CUSTOMER_SATISFACTION_INDEX | 78.4 | STAKEHOLDER_SURVEY |
| CHARTER_SCORE | 97 | SERVICE_DELIVERY_CUSTOMER_CHARTER |

### Result

- **BSC steps:** at least one failure (see table). Check CONTINUE_ON_ERROR.
- **Generate:** OK


## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:07:49.107Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no jobs goal in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl (optional GL-driven push; not run)
- inclusion-diversity-reporting (skipped unless goal title matches BSC text hints: diversity / inclusion / equity — seed “Inclusive programming” alone does not validate)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 200 | OK |
| resource-budget-alignment | 200 | OK |
| inclusion-diversity-reporting | 200 | OK |
| csr-participation-rate | 200 | OK |
| statutory-reports-output | 200 | OK |
| governance-checklist-score | 200 | OK |
| ease-of-doing-business-progress | 200 | OK |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### DB snapshot (selected goals after run)

| formulaType | currentValue | bscEntryKind (syncConfig) |
|-------------|--------------|---------------------------|
| ROI | 12 | FINANCIAL_OUTCOME_ROI |
| FUNDING_RATE | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| CUSTOMER_SATISFACTION_INDEX | 78.4 | STAKEHOLDER_SURVEY |
| CHARTER_SCORE | 102 | SERVICE_DELIVERY_CUSTOMER_CHARTER |

### Result

- **BSC steps:** all returned success.
- **Generate:** OK


## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:09:32.306Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no jobs goal in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl (optional GL-driven push; not run)
- inclusion-diversity-reporting (skipped unless a goal title contains diversity / inclusion / (non-debt) equity; CEO seed "Inclusive programming" fails BSC validation)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 200 | OK |
| resource-budget-alignment | 200 | OK |
| csr-participation-rate | 200 | OK |
| statutory-reports-output | 200 | OK |
| governance-checklist-score | 200 | OK |
| ease-of-doing-business-progress | 200 | OK |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### DB snapshot (selected goals after run)

| formulaType | currentValue | bscEntryKind (syncConfig) |
|-------------|--------------|---------------------------|
| ROI | 12 | FINANCIAL_OUTCOME_ROI |
| FUNDING_RATE | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| CUSTOMER_SATISFACTION_INDEX | 78.4 | STAKEHOLDER_SURVEY |
| CHARTER_SCORE | 107 | SERVICE_DELIVERY_CUSTOMER_CHARTER |

### Result

- **BSC steps:** all returned success.
- **Generate:** OK


## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:12:14.140Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### CEO contract goals — baseline (all rows drive the CEO scorecard)

| id | section | title | formulaType | target | current | bscEntryKind |
|----|---------|-------|-------------|--------|---------|--------------|
| cmo98dc1m0001un30sdqndgt5 | A1 | Return on Investment (ROI) | ROI | 12 | 12 | FINANCIAL_OUTCOME_ROI |
| cmo98dd330003un30px3mokwt | A1 | Revenue growth | REVENUE_GROWTH | 10 | 8 |  |
| cmo98dds20005un30h9ob3q6b | A1 | Business survival rate | BUSINESS_SURVIVAL_RATE | 90 | 88 |  |
| cmo98defp0007un30fmgyt6i3 | A1 | Corporate governance index | CORPORATE_GOVERNANCE_INDEX | 95 | 92 | GOVERNANCE_CHECKLIST_INDEX |
| cmo98df4s0009un30z0enh1gc | A1 | Funding rate | FUNDING_RATE | 85 | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dftc000bun30okbn7o62 | A2 | Statutory reports produced | STATUTORY_REPORTS | 100 | 102 | STATUTORY_REPORTS_OUTPUT |
| cmo98dgid000dun30azihekac | A2 | Projects funded (output) | PROJECTS_FUNDED | 100 | 90 |  |
| cmo98dh6t000fun30vwryn2f4 | A2 | Capital disbursed | CAPITAL_DISBURSED | 100 | 85 |  |
| cmo98dhvu000hun30gdtv4b2c | A2 | Resources mobilised | RESOURCES_MOBILISED | 100 | 75 |  |
| cmo98dikk000jun3032f7vq93 | B | Customer service charter (composite) | CHARTER_SCORE | 100 | 107 | SERVICE_DELIVERY_CUSTOMER_CHARTER |
| cmo98dja3000lun309tvk46pz | B | Customer satisfaction index | CUSTOMER_SATISFACTION_INDEX | 80 | 78.4 | STAKEHOLDER_SURVEY |
| cmo98djze000nun30r11ohkw0 | B | Ease of doing business innovations | EASE_OF_DOING_BUSINESS | 100 | 66.67 | EASE_OF_DOING_BUSINESS_PROGRESS |
| cmo98dkoe000pun3008kw85fv | C | Strategic allocation compliance | STRATEGIC_ALLOCATION_COMPLIANCE | 70 | 68 | RESOURCE_BUDGET_ALIGNMENT |
| cmo98dlde000run30i11fe57a | C | EBIT | DIRECT | 270000 | 265000 |  |
| cmo98dm8y000tun308lp4jgxi | C | Debt–equity ratio | RATIO | 1.5 | 65.23 | INCLUSION_DIVERSITY_REPORTING |
| cmo98dmxt000vun30yp87w9hq | C | Alternative resources mobilised | ALTERNATIVE_RESOURCES_MOBILISED | 100 | 55 |  |
| cmo98dnm1000xun30ddsfgvzr | C | E-government flagships | E_GOVERNMENT_FLAGSHIPS | 100 | 50 |  |
| cmo98doaz000zun3026b1xagi | D | Integrity and anti-corruption | DIRECT | 100 | 98 |  |
| cmo98doz40011un30mj1dhu7d | D | Health and wellness | DIRECT | 100 | 95 |  |
| cmo98dpn90013un30fbxaf1fb | D | Inclusive programming | DIRECT | 100 | 100 |  |
| cmo98dqav0015un30vl2svtms | D | Clean environment | DIRECT | 100 | 92 | CSR_PARTICIPATION_RATE |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no goal whose title matches jobs-created BSC hints in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl (skipped if **Revenue growth** or **EBIT** goal missing on contract)
- inclusion-diversity-reporting (skipped unless a goal title contains diversity / inclusion / (non-debt) equity; CEO seed "Inclusive programming" fails BSC validation)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| internal-process-projects-funded-output | 200 | OK |
| internal-process-capital-disbursed | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 200 | OK |
| resource-budget-alignment | 200 | OK |
| accounting-period-from-gl | 400 | This goal does not match this endpoint. "EBIT" is not set up for net-profit KPI. Please choose a goal aligned to this KPI. |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO contract goals — after BSC + generate (every row affects CEO scorecard calculations)

| id | section | title | formulaType | target | current | bscEntryKind |
|----|---------|-------|-------------|--------|---------|--------------|
| cmo98dc1m0001un30sdqndgt5 | A1 | Return on Investment (ROI) | ROI | 12 | 12 | FINANCIAL_OUTCOME_ROI |
| cmo98dd330003un30px3mokwt | A1 | Revenue growth | REVENUE_GROWTH | 10 | 8741452.19 | ACCOUNTING_GL_REVENUE_PERIOD |
| cmo98dds20005un30h9ob3q6b | A1 | Business survival rate | BUSINESS_SURVIVAL_RATE | 90 | 88 |  |
| cmo98defp0007un30fmgyt6i3 | A1 | Corporate governance index | CORPORATE_GOVERNANCE_INDEX | 95 | 92 | GOVERNANCE_CHECKLIST_INDEX |
| cmo98df4s0009un30z0enh1gc | A1 | Funding rate | FUNDING_RATE | 85 | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dftc000bun30okbn7o62 | A2 | Statutory reports produced | STATUTORY_REPORTS | 100 | 102 | STATUTORY_REPORTS_OUTPUT |
| cmo98dgid000dun30azihekac | A2 | Projects funded (output) | PROJECTS_FUNDED | 100 | 90 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dh6t000fun30vwryn2f4 | A2 | Capital disbursed | CAPITAL_DISBURSED | 100 | 85 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dhvu000hun30gdtv4b2c | A2 | Resources mobilised | RESOURCES_MOBILISED | 100 | 75 |  |
| cmo98dikk000jun3032f7vq93 | B | Customer service charter (composite) | CHARTER_SCORE | 100 | 112 | SERVICE_DELIVERY_CUSTOMER_CHARTER |
| cmo98dja3000lun309tvk46pz | B | Customer satisfaction index | CUSTOMER_SATISFACTION_INDEX | 80 | 78.4 | STAKEHOLDER_SURVEY |
| cmo98djze000nun30r11ohkw0 | B | Ease of doing business innovations | EASE_OF_DOING_BUSINESS | 100 | 66.67 | EASE_OF_DOING_BUSINESS_PROGRESS |
| cmo98dkoe000pun3008kw85fv | C | Strategic allocation compliance | STRATEGIC_ALLOCATION_COMPLIANCE | 70 | 68 | RESOURCE_BUDGET_ALIGNMENT |
| cmo98dlde000run30i11fe57a | C | EBIT | DIRECT | 270000 | 265000 |  |
| cmo98dm8y000tun308lp4jgxi | C | Debt–equity ratio | RATIO | 1.5 | 65.23 | INCLUSION_DIVERSITY_REPORTING |
| cmo98dmxt000vun30yp87w9hq | C | Alternative resources mobilised | ALTERNATIVE_RESOURCES_MOBILISED | 100 | 55 |  |
| cmo98dnm1000xun30ddsfgvzr | C | E-government flagships | E_GOVERNMENT_FLAGSHIPS | 100 | 50 |  |
| cmo98doaz000zun3026b1xagi | D | Integrity and anti-corruption | DIRECT | 100 | 98 |  |
| cmo98doz40011un30mj1dhu7d | D | Health and wellness | DIRECT | 100 | 95 |  |
| cmo98dpn90013un30fbxaf1fb | D | Inclusive programming | DIRECT | 100 | 100 |  |
| cmo98dqav0015un30vl2svtms | D | Clean environment | DIRECT | 100 | 92 | CSR_PARTICIPATION_RATE |

### Result

- **BSC steps:** at least one failure (see table). Check CONTINUE_ON_ERROR.
- **Generate:** OK


## CEO BSC E2E run

- **Timestamp:** 2026-04-21T23:13:37.312Z
- **API_BASE:** http://127.0.0.1:3009
- **E2E_YEAR:** 2026
- **CONTINUE_ON_ERROR:** false

- **Login user:** tatenda@niakazi.com (cmhlnqd460001unnslmw98ry8)

- **CEO contract id:** cmnxgq3hj0005un147p2qhqqs
- **Goals on contract:** 21

### Auth

| Step | Result |
|------|--------|
| Login | OK |

### CEO contract goals — baseline (all rows drive the CEO scorecard)

| id | section | title | formulaType | target | current | bscEntryKind |
|----|---------|-------|-------------|--------|---------|--------------|
| cmo98dc1m0001un30sdqndgt5 | A1 | Return on Investment (ROI) | ROI | 12 | 12 | FINANCIAL_OUTCOME_ROI |
| cmo98dd330003un30px3mokwt | A1 | Revenue growth | REVENUE_GROWTH | 10 | 8741452.19 | ACCOUNTING_GL_REVENUE_PERIOD |
| cmo98dds20005un30h9ob3q6b | A1 | Business survival rate | BUSINESS_SURVIVAL_RATE | 90 | 88 |  |
| cmo98defp0007un30fmgyt6i3 | A1 | Corporate governance index | CORPORATE_GOVERNANCE_INDEX | 95 | 92 | GOVERNANCE_CHECKLIST_INDEX |
| cmo98df4s0009un30z0enh1gc | A1 | Funding rate | FUNDING_RATE | 85 | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dftc000bun30okbn7o62 | A2 | Statutory reports produced | STATUTORY_REPORTS | 100 | 102 | STATUTORY_REPORTS_OUTPUT |
| cmo98dgid000dun30azihekac | A2 | Projects funded (output) | PROJECTS_FUNDED | 100 | 90 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dh6t000fun30vwryn2f4 | A2 | Capital disbursed | CAPITAL_DISBURSED | 100 | 85 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dhvu000hun30gdtv4b2c | A2 | Resources mobilised | RESOURCES_MOBILISED | 100 | 75 |  |
| cmo98dikk000jun3032f7vq93 | B | Customer service charter (composite) | CHARTER_SCORE | 100 | 112 | SERVICE_DELIVERY_CUSTOMER_CHARTER |
| cmo98dja3000lun309tvk46pz | B | Customer satisfaction index | CUSTOMER_SATISFACTION_INDEX | 80 | 78.4 | STAKEHOLDER_SURVEY |
| cmo98djze000nun30r11ohkw0 | B | Ease of doing business innovations | EASE_OF_DOING_BUSINESS | 100 | 66.67 | EASE_OF_DOING_BUSINESS_PROGRESS |
| cmo98dkoe000pun3008kw85fv | C | Strategic allocation compliance | STRATEGIC_ALLOCATION_COMPLIANCE | 70 | 68 | RESOURCE_BUDGET_ALIGNMENT |
| cmo98dlde000run30i11fe57a | C | EBIT | DIRECT | 270000 | 265000 |  |
| cmo98dm8y000tun308lp4jgxi | C | Debt–equity ratio | RATIO | 1.5 | 65.23 | INCLUSION_DIVERSITY_REPORTING |
| cmo98dmxt000vun30yp87w9hq | C | Alternative resources mobilised | ALTERNATIVE_RESOURCES_MOBILISED | 100 | 55 |  |
| cmo98dnm1000xun30ddsfgvzr | C | E-government flagships | E_GOVERNMENT_FLAGSHIPS | 100 | 50 |  |
| cmo98doaz000zun3026b1xagi | D | Integrity and anti-corruption | DIRECT | 100 | 98 |  |
| cmo98doz40011un30mj1dhu7d | D | Health and wellness | DIRECT | 100 | 95 |  |
| cmo98dpn90013un30fbxaf1fb | D | Inclusive programming | DIRECT | 100 | 100 |  |
| cmo98dqav0015un30vl2svtms | D | Clean environment | DIRECT | 100 | 92 | CSR_PARTICIPATION_RATE |

### Skipped (no matching seeded goal or needs multipart/GL)

- partnerships-signed (no partnership/MOU goal in CEO seed)
- jobs-created-aggregate (no goal whose title matches jobs-created BSC hints in CEO seed)
- procurement-plan-compliance (no procurement goal in CEO seed)
- skills-development-progress (no skills/certificate goal in CEO seed)
- accounting-period-from-gl net-profit half (skipped if no goal matches BSC net-profit hints; **Revenue growth** GL push runs when present)
- inclusion-diversity-reporting (skipped unless a goal title contains diversity / inclusion / (non-debt) equity; CEO seed "Inclusive programming" fails BSC validation)

### BSC entry calls

| Endpoint | HTTP | Message / note |
|----------|------|----------------|
| financial-outcome-roi | 200 | OK |
| internal-process-funding-rate | 200 | OK |
| internal-process-projects-funded-output | 200 | OK |
| internal-process-capital-disbursed | 200 | OK |
| stakeholder-survey | 200 | OK |
| service-delivery-customer-charter | 200 | OK |
| resource-budget-alignment | 200 | OK |
| accounting-period-from-gl | 200 | OK |
| csr-participation-rate | 200 | OK |
| statutory-reports-output | 200 | OK |
| governance-checklist-score | 200 | OK |
| ease-of-doing-business-progress | 200 | OK |
| ease-of-doing-business-e-government-flagships | 200 | OK |

### CEO scorecard preview (GET)

- **HTTP:** 200
- **Summary:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO scorecard generate (POST)

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **savedRecord.id:** cmnl2slsh0001unzslzp99yq7
- **scores snapshot:** `{"finalScore":2.95,"performanceLabel":"Satisfactory","sectionBlendScore":2.95,"sectionScores":{"A1":3,"A2":3,"B":2.7,"C":3,"D":3.25},"sectionSummary":{"A1":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"A2":{"sectionScore":3,"label":"Satisfactory","indicatorCount":4},"B":{"sectionScore":2.7,"label":"Satisfactory","indicatorCount":3},"C":{"sectionScore":3,"label":"Satisfactory","indicatorCount":5},"D":{"sectionScore":3.25,"label":"Satisfactory","indicatorCount":4}},"totalIndicatorsSummarised":21,"warnings":["No Board Chairperson assigned as reviewer on this contract. The scorecard cannot be finalised until a reviewer is assigned.","This period has not ended. Scorecard reflects performance to date only."],"contractId":"cmnxgq3hj0005un147p2qhqqs"}`

### CEO contract goals — after BSC + generate (every row affects CEO scorecard calculations)

| id | section | title | formulaType | target | current | bscEntryKind |
|----|---------|-------|-------------|--------|---------|--------------|
| cmo98dc1m0001un30sdqndgt5 | A1 | Return on Investment (ROI) | ROI | 12 | 12 | FINANCIAL_OUTCOME_ROI |
| cmo98dd330003un30px3mokwt | A1 | Revenue growth | REVENUE_GROWTH | 10 | 8741452.19 | ACCOUNTING_GL_REVENUE_PERIOD |
| cmo98dds20005un30h9ob3q6b | A1 | Business survival rate | BUSINESS_SURVIVAL_RATE | 90 | 88 |  |
| cmo98defp0007un30fmgyt6i3 | A1 | Corporate governance index | CORPORATE_GOVERNANCE_INDEX | 95 | 92 | GOVERNANCE_CHECKLIST_INDEX |
| cmo98df4s0009un30z0enh1gc | A1 | Funding rate | FUNDING_RATE | 85 | 80 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dftc000bun30okbn7o62 | A2 | Statutory reports produced | STATUTORY_REPORTS | 100 | 103 | STATUTORY_REPORTS_OUTPUT |
| cmo98dgid000dun30azihekac | A2 | Projects funded (output) | PROJECTS_FUNDED | 100 | 90 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dh6t000fun30vwryn2f4 | A2 | Capital disbursed | CAPITAL_DISBURSED | 100 | 85 | INTERNAL_PROCESS_FUNDING_RATE |
| cmo98dhvu000hun30gdtv4b2c | A2 | Resources mobilised | RESOURCES_MOBILISED | 100 | 75 |  |
| cmo98dikk000jun3032f7vq93 | B | Customer service charter (composite) | CHARTER_SCORE | 100 | 117 | SERVICE_DELIVERY_CUSTOMER_CHARTER |
| cmo98dja3000lun309tvk46pz | B | Customer satisfaction index | CUSTOMER_SATISFACTION_INDEX | 80 | 78.4 | STAKEHOLDER_SURVEY |
| cmo98djze000nun30r11ohkw0 | B | Ease of doing business innovations | EASE_OF_DOING_BUSINESS | 100 | 66.67 | EASE_OF_DOING_BUSINESS_PROGRESS |
| cmo98dkoe000pun3008kw85fv | C | Strategic allocation compliance | STRATEGIC_ALLOCATION_COMPLIANCE | 70 | 68 | RESOURCE_BUDGET_ALIGNMENT |
| cmo98dlde000run30i11fe57a | C | EBIT | DIRECT | 270000 | 265000 |  |
| cmo98dm8y000tun308lp4jgxi | C | Debt–equity ratio | RATIO | 1.5 | 65.23 | INCLUSION_DIVERSITY_REPORTING |
| cmo98dmxt000vun30yp87w9hq | C | Alternative resources mobilised | ALTERNATIVE_RESOURCES_MOBILISED | 100 | 55 |  |
| cmo98dnm1000xun30ddsfgvzr | C | E-government flagships | E_GOVERNMENT_FLAGSHIPS | 100 | 50 | EASE_OF_DOING_BUSINESS_PROGRESS |
| cmo98doaz000zun3026b1xagi | D | Integrity and anti-corruption | DIRECT | 100 | 98 |  |
| cmo98doz40011un30mj1dhu7d | D | Health and wellness | DIRECT | 100 | 95 |  |
| cmo98dpn90013un30fbxaf1fb | D | Inclusive programming | DIRECT | 100 | 100 |  |
| cmo98dqav0015un30vl2svtms | D | Clean environment | DIRECT | 100 | 92 | CSR_PARTICIPATION_RATE |

### Result

- **BSC steps:** all returned success.
- **Generate:** OK

