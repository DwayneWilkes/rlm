# Tasks: add-config-profiles

## Phase 1: Config Schema (TDD)

### 1.1 Write tests for profile schema
- [ ] Test: validates profile structure with provider/model/budget
- [ ] Test: validates extends references existing profile
- [ ] Test: detects circular extends
- [ ] Test: accepts flat config (backward compatibility)
- [ ] Test: merges extended profile with overrides
- [ ] Test: deep merges nested objects (budget, repl)
- [ ] Test: resolves chained extends (A extends B extends C)
- [ ] Test: validates subcallProvider as separate provider
- [ ] Test: subcallProvider falls back to provider when not specified

### 1.2 Update Zod schema
- [ ] Add ProfileConfig type
- [ ] Add RLMConfigWithProfiles type
- [ ] Add extends resolution logic
- [ ] Maintain backward compatibility with flat configs

### 1.3 Update core types
- [ ] Add subcallProvider to RLMConfig in packages/core/src/types.ts
- [ ] Update executor to use subcallProvider when specified
- [ ] Add tests for subcallProvider in types.test.ts

## Phase 2: Config Loader (TDD)

### 2.1 Write tests for profile resolution
- [ ] Test: resolves default profile when no flag
- [ ] Test: resolves --profile flag
- [ ] Test: resolves RLM_PROFILE env var
- [ ] Test: CLI flags override profile values
- [ ] Test: errors on missing profile with suggestions
- [ ] Test: resolves extends chain

### 2.2 Implement profile resolution
- [ ] Add getProfile() to config loader
- [ ] Add resolveExtends() for inheritance
- [ ] Add priority merging (CLI > profile > defaults)

## Phase 3: CLI Commands (TDD)

### 3.1 Write tests for --profile flag
- [ ] Test: run command accepts --profile/-p
- [ ] Test: invalid profile shows available profiles
- [ ] Test: profile merged with CLI overrides

### 3.2 Write tests for config commands
- [ ] Test: `config list` shows all profiles
- [ ] Test: `config list` marks default profile
- [ ] Test: `config show <name>` displays resolved config
- [ ] Test: `config show` without name shows current

### 3.3 Implement CLI changes
- [ ] Add --profile/-p to run command
- [ ] Add `config list` subcommand
- [ ] Add `config show` subcommand

## Phase 4: Spec Updates

### 4.1 Update cli spec
- [ ] Add requirement for profile configuration
- [ ] Add requirement for profile CLI flag
- [ ] Add requirement for config list/show commands

## Phase 5: Documentation & Verification

### 5.1 Update project.md
- [ ] Document profile config format
- [ ] Add example profiles section

### 5.2 Run test suite
- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm typecheck` - no type errors

### 5.3 Manual verification
- [ ] Test with sample profiles config
- [ ] Verify backward compatibility with flat config

## Dependencies

- Phase 2 depends on Phase 1
- Phase 3 depends on Phase 2
- Phase 4-5 can run after Phase 3
