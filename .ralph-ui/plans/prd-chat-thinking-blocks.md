# Plan: Show Claude Thinking in PRD Chat

**Created**: 2026-01-18
**Status**: Draft

## Problem Summary

When using Opus or other Claude 4 models in PRD chat, the model does internal planning/thinking but only outputs a summary. Users see the final response but not Claude's reasoning process.

**Root Cause**: Two-layer limitation:
1. **Claude 4 API behavior**: Returns summarized thinking by default (full thinking encrypted in signature)
2. **Claude Code CLI limitation**: Even this summary isn't exposed in `-p` mode output

**Current Ralph UI Implementation** (`src-tauri/src/commands/prd_chat.rs:1540-1612`):
- Uses `claude -p "[prompt]"` (print mode)
- Only captures final `result` text from stdout
- No access to thinking blocks

**ralph-tui's Approach** (from user's reference):
- Uses `claude --print --verbose --output-format stream-json`
- Parses JSONL for `assistant` messages with `content[]` arrays
- Still doesn't show thinking because CLI doesn't expose it

## Solution: Switch to stream-json + Thinking Block Support

### Approach
1. Use `--output-format stream-json --verbose` to get structured output
2. Parse JSONL stream for thinking blocks when/if they appear
3. Store thinking content alongside message content in database
4. Display thinking in collapsible UI component
5. Prepare infrastructure for future when Claude CLI exposes thinking

### Why This Approach
- **Forward-compatible**: Infrastructure ready when CLI adds thinking support (feature request #8477)
- **Minimal risk**: Still works even without thinking blocks
- **Better structure**: JSONL parsing enables richer response handling
- **Matches ralph-tui**: Aligns with the reference implementation pattern

## Implementation Plan

### Phase 1: Backend - JSONL Streaming Support

**File: `src-tauri/src/commands/prd_chat.rs`**

1. **Update `execute_chat_agent()` (lines 1549-1552)**
   ```rust
   // Before:
   ("claude", vec!["-p".to_string(), prompt.to_string()])

   // After:
   ("claude", vec![
       "-p".to_string(),
       "--verbose".to_string(),
       "--output-format".to_string(),
       "stream-json".to_string(),
       prompt.to_string()
   ])
   ```

2. **Add JSONL parsing module** (`src-tauri/src/parsers/claude_jsonl.rs`)
   - Parse JSONL lines from stdout
   - Extract `type: "assistant"` messages
   - Look for `thinking` content blocks in content array
   - Fall back to `text` blocks for response

3. **Update response handling** (lines 1596-1598)
   ```rust
   // Parse JSONL output instead of raw text
   let (thinking, response) = parse_claude_jsonl_output(&output.stdout)?;
   Ok(ChatAgentResult { thinking, response })
   ```

### Phase 2: Database Schema Update

**File: `src-tauri/src/database/mod.rs`**

1. **Add migration v8** - Add `thinking` column to `prd_chat_messages`:
   ```sql
   ALTER TABLE prd_chat_messages ADD COLUMN thinking TEXT;
   ```

2. **Update ChatMessage struct** (`src-tauri/src/models/prd_chat.rs`):
   ```rust
   pub struct ChatMessage {
       // existing fields...
       pub thinking: Option<String>,
   }
   ```

### Phase 3: Frontend Types & Store

**File: `src/types/index.ts`**
```typescript
export interface ChatMessage {
  // existing fields...
  thinking?: string;
}
```

**File: `src/stores/prdChatStore.ts`**
- No changes needed - `ChatMessage` type flows through automatically

### Phase 4: UI Component

**File: `src/components/prd/ThinkingBlock.tsx`** (new file)
```typescript
// Collapsible component to display thinking content
// - Shows "Thinking" header with expand/collapse
// - Blue-tinted background to distinguish from response
// - Max-height with scroll for long thinking
```

**File: `src/components/prd/ChatMessageItem.tsx`**
- Import `ThinkingBlock`
- Render before response content for assistant messages:
  ```tsx
  {!isUser && message.thinking && (
    <ThinkingBlock content={message.thinking} />
  )}
  ```

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/commands/prd_chat.rs` | CLI args, JSONL parsing |
| `src-tauri/src/parsers/mod.rs` | Add claude_jsonl module |
| `src-tauri/src/parsers/claude_jsonl.rs` | New - JSONL parser |
| `src-tauri/src/database/mod.rs` | Schema migration v8 |
| `src-tauri/src/models/prd_chat.rs` | Add thinking field |
| `src/types/index.ts` | Add thinking to ChatMessage |
| `src/components/prd/ThinkingBlock.tsx` | New - UI component |
| `src/components/prd/ChatMessageItem.tsx` | Render thinking block |

## Verification

1. **Unit Tests** (Rust)
   - Test JSONL parser with sample stream-json output
   - Test parser handles missing thinking gracefully
   - Test database migration

2. **Integration Test**
   - Start PRD chat session
   - Send message requiring reasoning (e.g., "Create a user story for authentication")
   - Verify response appears (thinking may or may not appear depending on CLI)
   - Check database has thinking column

3. **E2E Test**
   - Open PRD chat
   - Send complex prompt
   - Verify ThinkingBlock renders when thinking present
   - Verify expand/collapse works

4. **Manual Test Commands**
   ```bash
   # Test JSONL output format
   echo "Plan a login feature" | claude -p --verbose --output-format stream-json

   # Run Rust tests
   cd src-tauri && cargo test

   # Run frontend tests
   bun test

   # Full app test
   bun run tauri dev
   ```

## Notes

- Thinking blocks may not appear immediately if Claude CLI doesn't expose them yet
- The infrastructure will be ready when Anthropic adds this feature to the CLI
- Current behavior: shows response, thinking block hidden (null/empty)
- Future behavior: shows thinking block above response when available

## Changelog

- 2026-01-18: Initial plan created
