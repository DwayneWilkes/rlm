# Tasks: enhance-helper-functions

## Phase 1: New Utility Functions (TDD)

### 1.1 Write tests for count_matches
- [ ] Add test: returns count of regex matches
- [ ] Add test: returns 0 when no matches
- [ ] Add test: supports regex patterns
- [ ] Add test: rejects overly long patterns (security)

### 1.2 Write tests for extract_json
- [ ] Add test: extracts JSON object from text
- [ ] Add test: extracts JSON array from text
- [ ] Add test: returns None when no valid JSON
- [ ] Add test: handles nested JSON
- [ ] Add test: handles malformed JSON gracefully

### 1.3 Write tests for extract_sections
- [ ] Add test: extracts sections by header pattern
- [ ] Add test: includes section content between headers
- [ ] Add test: returns empty list when no sections found
- [ ] Add test: handles multiline regex (MULTILINE flag)

### 1.4 Implement utility functions
- [ ] Implement `count_matches(pattern)` in python-setup.ts
- [ ] Implement `extract_json(text)` in python-setup.ts
- [ ] Implement `extract_sections(pattern)` in python-setup.ts
- [ ] Add functions to both PYTHON_SETUP and PYTHON_SETUP_WORKER

## Phase 2: Batch RLM Query

### 2.1 Write tests for batch_rlm_query
- [ ] Add test: executes multiple sub-RLMs
- [ ] Add test: returns results in same order as tasks
- [ ] Add test: enforces budget limit on parallel tasks
- [ ] Add test: gracefully handles partial failures

### 2.2 Implement batch_rlm_query bridge
- [ ] Add onBatchRLMQuery to SandboxBridges interface
- [ ] Implement bridge handler in executor.ts
- [ ] Add Python wrapper function to python-setup.ts

## Phase 3: System Prompt Enhancement

### 3.1 Update system prompt
- [ ] Add new functions to ENVIRONMENT section
- [ ] Add code block batching guidance to EXECUTION section
- [ ] Add efficiency tips to STRATEGY section
- [ ] Update sub-RLM prompt with batch_rlm_query guidance

## Phase 4: Spec Updates

### 4.1 Update repl-sandbox spec
- [ ] Add requirement for count_matches function
- [ ] Add requirement for extract_json function
- [ ] Add requirement for extract_sections function

### 4.2 Update execution-engine spec
- [ ] Add requirement for batch_rlm_query bridge
- [ ] Update system prompt requirements

## Phase 5: Verification

### 5.1 Run test suite
- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm typecheck` - no type errors
- [ ] Run `pnpm lint` - no lint errors

### 5.2 Manual verification
- [ ] Test new functions with sample context
- [ ] Verify system prompt displays correctly

## Dependencies

- Phase 1.4 depends on 1.1-1.3 (TDD)
- Phase 2.2 depends on 2.1 (TDD)
- Phase 3 can run in parallel with Phase 2
- Phase 4 can run after Phase 1-3
- Phase 5 runs last
